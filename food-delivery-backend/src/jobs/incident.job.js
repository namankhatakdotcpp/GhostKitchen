import cron from "node-cron";
import { logger } from "../utils/logger.js";
import { runAutoIncidents, runEscalations } from "../modules/ops/ops.service.js";
import { acquireRedisLock, releaseRedisLock } from "../utils/redisLock.js";

const LOCK_KEY = "lock:incident-engine";
const LOCK_TTL_SEC = 110;

// Exported so /health/extended can surface last-run visibility without a DB query.
export const incidentJobStatus = { lastRunAt: null, lastError: null };

export const startIncidentJob = () => {
  cron.schedule("*/2 * * * *", async () => {
    const acquired = await acquireRedisLock(LOCK_KEY, LOCK_TTL_SEC);
    if (!acquired) return;

    try {
      const auto = await runAutoIncidents();
      const esc = await runEscalations();
      if (auto.created || auto.escalated || esc.escalated || esc.renotified) {
        logger.info("Incident engine run", { ...auto, ...esc });
      }
      incidentJobStatus.lastRunAt = new Date().toISOString();
      incidentJobStatus.lastError = null;
    } catch (error) {
      logger.error("Incident engine error", { error: error.message });
      incidentJobStatus.lastError = error.message;
      incidentJobStatus.lastRunAt = new Date().toISOString();
    } finally {
      await releaseRedisLock(LOCK_KEY);
    }
  });

  logger.info("Incident engine scheduled (every 2 minutes, distributed-lock guarded)");
};

export default startIncidentJob;
