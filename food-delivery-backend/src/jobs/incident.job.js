import cron from "node-cron";
import { logger } from "../utils/logger.js";
import { runAutoIncidents, runEscalations } from "../modules/ops/ops.service.js";

/**
 * Operations incident engine — runs every 2 minutes.
 *
 * 1. runAutoIncidents: scans the live fleet snapshot and raises (or escalates,
 *    deduplicated) incidents for overloaded restaurants, offline assigned riders,
 *    delayed deliveries and stuck orders.
 * 2. runEscalations: ages OPEN incidents up in severity and re-notifies admins.
 *
 * NOTE: this is single-instance safe. On multi-instance deployments add a
 * distributed lock (e.g. a Redis SETNX) so only one worker runs the engine.
 */
export const startIncidentJob = () => {
  cron.schedule("*/2 * * * *", async () => {
    try {
      const auto = await runAutoIncidents();
      const esc = await runEscalations();
      if (auto.created || auto.escalated || esc.escalated || esc.renotified) {
        logger.info("Incident engine run", { ...auto, ...esc });
      }
    } catch (error) {
      logger.error("Incident engine error", { error: error.message });
    }
  });

  logger.info("Incident engine scheduled (every 2 minutes)");
};

export default startIncidentJob;
