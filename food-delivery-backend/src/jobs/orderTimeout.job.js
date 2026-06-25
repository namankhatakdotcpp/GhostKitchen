import cron from "node-cron";
import { prisma } from "../config/prisma.js";
import { logger } from "../utils/logger.js";
import { captureException } from "../config/sentry.js";
import { acquireRedisLock, releaseRedisLock } from "../utils/redisLock.js";
import { cancelOrderById } from "../modules/orders/orders.service.js";

const LOCK_KEY = "lock:housekeeping";
const LOCK_TTL_SEC = 540;

const AUTO_REJECT_LOCK_KEY = "lock:auto-reject-orders";
const AUTO_REJECT_LOCK_TTL_SEC = 50;
// Mirrors the shop board's countdown (shop-orders-page.tsx / opsData.ts) — a
// restaurant that hasn't accepted (still PLACED) within this window gets
// auto-rejected. Keep these in sync if either side changes.
const AUTO_REJECT_MINUTES = 5;

export const autoRejectJobStatus = { lastRunAt: null, lastError: null };

export const housekeepingJobStatus = { lastRunAt: null, lastError: null };

/**
 * Housekeeping job — runs every 10 minutes.
 *
 * 1. Expire stale payment intents: Payment rows stuck in PENDING for >30 min
 *    (user opened checkout and never paid). Keeps payment history clean and
 *    stops them being picked up by /payments/verify later.
 * 2. Purge expired refresh tokens so the table doesn't grow forever.
 *
 * NOTE: the previous version updated Order rows by a `paymentStatus` column
 * that doesn't exist on the Order model — it threw a Prisma validation error
 * on every run and never did anything.
 */

const PAYMENT_TIMEOUT_MINUTES = 30;

export const startOrderTimeoutJob = () => {
  cron.schedule("*/10 * * * *", async () => {
    const acquired = await acquireRedisLock(LOCK_KEY, LOCK_TTL_SEC);
    if (!acquired) return; // another instance is handling this cycle

    try {
      const cutoff = new Date(Date.now() - PAYMENT_TIMEOUT_MINUTES * 60 * 1000);

      const stale = await prisma.payment.updateMany({
        where: { status: "PENDING", createdAt: { lt: cutoff } },
        data: { status: "FAILED" },
      });

      const tokens = await prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      if (stale.count > 0 || tokens.count > 0) {
        logger.info("Housekeeping job completed", {
          expiredPayments: stale.count,
          purgedRefreshTokens: tokens.count,
        });
      }
      housekeepingJobStatus.lastRunAt = new Date().toISOString();
      housekeepingJobStatus.lastError = null;
    } catch (error) {
      logger.error("Housekeeping job error", { error: error.message });
      captureException(error, { job: "housekeeping" });
      housekeepingJobStatus.lastError = error.message;
      housekeepingJobStatus.lastRunAt = new Date().toISOString();
    } finally {
      await releaseRedisLock(LOCK_KEY);
    }
  });

  logger.info("Housekeeping job scheduled (every 10 minutes, distributed-lock guarded)");
};

/**
 * Auto-reject job — runs every minute.
 *
 * The shop board shows a 5-minute countdown on each new (PLACED) order and
 * removes the card from the restaurant's own screen when it expires, but
 * that was previously client-side only: it never told the backend, so the
 * order's real status stayed PLACED forever — invisible to the customer,
 * rider, and admin, and still pickable up by any flow that expects a real
 * status. This job is the actual enforcement: any order still PLACED past
 * the window gets cancelled server-side via the same cancelOrderById used
 * by the manual Cancel/Reject button, so both paths notify the customer +
 * rider and auto-refund a paid order identically.
 *
 * Runs every minute (tighter than the 10-minute housekeeping cycle above)
 * since the window itself is only 5 minutes — a 10-minute poll could let an
 * order sit unrejected for up to 15 minutes before being caught.
 */
export const startAutoRejectJob = () => {
  cron.schedule("* * * * *", async () => {
    const acquired = await acquireRedisLock(AUTO_REJECT_LOCK_KEY, AUTO_REJECT_LOCK_TTL_SEC);
    if (!acquired) return;

    try {
      const cutoff = new Date(Date.now() - AUTO_REJECT_MINUTES * 60 * 1000);
      const stale = await prisma.order.findMany({
        where: { status: "PLACED", placedAt: { lt: cutoff } },
        select: { id: true },
      });

      for (const { id } of stale) {
        try {
          await cancelOrderById(id, { reason: "Auto-rejected: restaurant did not respond in time" });
        } catch (err) {
          logger.error("Auto-reject job: failed to cancel order", { orderId: id, error: err.message });
        }
      }

      if (stale.length > 0) {
        logger.info("Auto-reject job completed", { autoRejectedCount: stale.length });
      }
      autoRejectJobStatus.lastRunAt = new Date().toISOString();
      autoRejectJobStatus.lastError = null;
    } catch (error) {
      logger.error("Auto-reject job error", { error: error.message });
      captureException(error, { job: "auto-reject" });
      autoRejectJobStatus.lastError = error.message;
      autoRejectJobStatus.lastRunAt = new Date().toISOString();
    } finally {
      await releaseRedisLock(AUTO_REJECT_LOCK_KEY);
    }
  });

  logger.info("Auto-reject job scheduled (every 1 minute, distributed-lock guarded)");
};

export default startOrderTimeoutJob;
