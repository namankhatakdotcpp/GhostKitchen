import cron from "node-cron";
import { prisma } from "../config/prisma.js";
import { logger } from "../utils/logger.js";
import { captureException } from "../config/sentry.js";
import { acquireRedisLock, releaseRedisLock } from "../utils/redisLock.js";
import { getIO } from "../socket/socketServer.js";
import { assignDeliveryAgent } from "../modules/orders/orders.service.js";

const LOCK_KEY = "lock:agent-reassignment";
const LOCK_TTL_SEC = 90;
const OFFER_TIMEOUT_MS = 30_000;

export const agentReassignmentJobStatus = { lastRunAt: null, lastError: null };

/**
 * Retries delivery-agent assignment every 2 minutes for orders that are
 * still active (CONFIRMED/PREPARING/OUT_FOR_DELIVERY) but have no agentId.
 *
 * assignDeliveryAgent() only runs synchronously on a status transition — if
 * zero riders were online at that exact moment (or a rider's "online" toggle
 * silently failed client-side), the order is stuck with agentId=null forever
 * unless something retries later. This job is that retry.
 *
 * It also sweeps stale offers: an order with pendingAgentId set but
 * agentOfferedAt older than 30s means the rider never responded (closed the
 * app, lost connection, ignored it). Without this sweep that order is stuck
 * waiting on a rider who will never answer — never falls through to anyone
 * else, and the unconditional-orphan query above would also skip it since
 * agentId is still null but pendingAgentId is NOT, so it'd be silently
 * invisible to both the "no offer yet" and "already assigned" cases.
 */
export const startAgentReassignmentJob = () => {
  cron.schedule("*/2 * * * *", async () => {
    const acquired = await acquireRedisLock(LOCK_KEY, LOCK_TTL_SEC);
    if (!acquired) return; // another instance is handling this cycle

    try {
      let io;
      try {
        io = getIO();
      } catch {
        logger.warn("Agent reassignment job: socket not initialised yet, skipping cycle");
        return;
      }

      // 1. Stale offers — rider never responded within 30s. Free them and
      // the order, then fall through to the retry pass below to re-offer.
      const staleOfferCutoff = new Date(Date.now() - OFFER_TIMEOUT_MS);
      const staleOffers = await prisma.order.findMany({
        where: {
          status: { in: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"] },
          agentId: null,
          pendingAgentId: { not: null },
          agentOfferedAt: { lt: staleOfferCutoff },
        },
        select: { id: true, pendingAgentId: true },
      });

      for (const { id: orderId, pendingAgentId } of staleOffers) {
        logger.warn("Agent reassignment job: offer timed out, clearing and re-offering", { orderId, agentId: pendingAgentId });
        await prisma.order.updateMany({
          where: { id: orderId, pendingAgentId },
          data: { pendingAgentId: null, agentOfferedAt: null },
        });
        await prisma.user.update({ where: { id: pendingAgentId }, data: { isAvailable: true } }).catch(() => {});
      }

      // 2. Orders with no agent and no live offer — either never got one, or
      // just had a stale one cleared above.
      const orphaned = await prisma.order.findMany({
        where: {
          status: { in: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"] },
          agentId: null,
          pendingAgentId: null,
        },
        select: { id: true },
      });

      if (orphaned.length > 0) {
        logger.info("Agent reassignment job: retrying unassigned orders", { count: orphaned.length });
        for (const { id: orderId } of orphaned) {
          await assignDeliveryAgent(orderId, io).catch((err) =>
            logger.error("Agent reassignment job: assignment failed", { orderId, error: err.message })
          );
        }
      }

      agentReassignmentJobStatus.lastRunAt = new Date().toISOString();
      agentReassignmentJobStatus.lastError = null;
    } catch (error) {
      logger.error("Agent reassignment job error", { error: error.message });
      captureException(error, { job: "agent-reassignment" });
      agentReassignmentJobStatus.lastError = error.message;
      agentReassignmentJobStatus.lastRunAt = new Date().toISOString();
    } finally {
      await releaseRedisLock(LOCK_KEY);
    }
  });

  logger.info("Agent reassignment job scheduled (every 2 minutes, distributed-lock guarded)");
};

export default startAgentReassignmentJob;
