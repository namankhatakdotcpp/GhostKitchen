import cron from "node-cron";
import { logger } from "../utils/logger.js";
import { runAutoIncidents, runEscalations } from "../modules/ops/ops.service.js";
import { acquireRedisLock, releaseRedisLock } from "../utils/redisLock.js";

const LOCK_KEY = "lock:incident-engine";
// TTL is 110 s — just under the 2-minute interval. If the holder crashes the
// lock self-expires before the next run so we never permanently skip the job.
const LOCK_TTL_SEC = 110;

/**
 * Operations incident engine — runs every 2 minutes.
 *
 * Distributed-lock guarded: only ONE instance runs per cycle.
 * Without the lock, N instances each create incidents/escalations → duplicates.
 *
 * Fail-open: when Redis is unavailable the lock is skipped and every instance
 * runs (same behaviour as before Redis was added).
 */
export const startIncidentJob = () => {
  cron.schedule("*/2 * * * *", async () => {
    const acquired = await acquireRedisLock(LOCK_KEY, LOCK_TTL_SEC);
    if (!acquired) return; // another instance is running this cycle

    try {
      const auto = await runAutoIncidents();
      const esc = await runEscalations();
      if (auto.created || auto.escalated || esc.escalated || esc.renotified) {
        logger.info("Incident engine run", { ...auto, ...esc });
      }
    } catch (error) {
      logger.error("Incident engine error", { error: error.message });
    } finally {
      await releaseRedisLock(LOCK_KEY);
    }
  });

  logger.info("Incident engine scheduled (every 2 minutes, distributed-lock guarded)");
};

export default startIncidentJob;
