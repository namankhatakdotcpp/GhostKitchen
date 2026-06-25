import dotenv from "dotenv";
import http from "http";

// 1. Load env before EVERYTHING (must be before Sentry init)
dotenv.config({ path: ".env" });

import { initSentry } from "./config/sentry.js";
initSentry();

import app from "./app.js";

import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { connectRedis } from "./config/redis.js";
import { initSocket } from "./socket/socketServer.js";
import { startOrderTimeoutJob, startAutoRejectJob } from "./jobs/orderTimeout.job.js";
import { startIncidentJob } from "./jobs/incident.job.js";
import { startAgentReassignmentJob } from "./jobs/agentReassignment.job.js";
import { getSiteConfigCached, applyMaintenanceSchedule } from "./modules/config/config.service.js";
import { acquireRedisLock, releaseRedisLock } from "./utils/redisLock.js";
import cron from "node-cron";
import { logger } from "./utils/logger.js";
import { captureException } from "./config/sentry.js";

// Global Async Error Safety
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", { reason, promise });
  captureException(reason instanceof Error ? reason : new Error(String(reason)));
});
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error: error.message, stack: error.stack });
  captureException(error);
});

const startServer = async () => {
  try {
    // 2. Connect Database
    try {
      await prisma.$connect();
      logger.info("✓ Database connected");
    } catch (dbError) {
      logger.error("❌ Database connection failed. Proceeding with caution.", { error: dbError.message });
    }

    // 3. Connect Redis Safety
    await connectRedis();

    // 4. Start Express server
    const server = http.createServer(app);
    server.listen(env.PORT, async () => {
      logger.info("✓ Server running successfully", {
        port: env.PORT,
        cashfreeEnv: env.CASHFREE_ENV,
        nodeEnv: env.NODE_ENV,
      });

      // 5. Initialize Socket.IO explicitly after Redis attempting
      try {
        const io = await initSocket(server);
        app.locals.io = io;
      } catch (socketError) {
        logger.error("❌ Socket initialization failed", { error: socketError.message });
      }

      // Background jobs safely
      try {
        startOrderTimeoutJob();
        startAutoRejectJob();
        startIncidentJob();
        startAgentReassignmentJob();
      } catch (jobError) {
        logger.error("❌ Job initialisation failed", { error: jobError.message });
      }

      // Maintenance schedule cron — runs every minute.
      // Lock-guarded: without it, N instances each emit maintenance:started →
      // every connected client receives N duplicate socket events per transition.
      cron.schedule("* * * * *", async () => {
        try {
          const cfg = await getSiteConfigCached();
          if (!cfg.maintenanceScheduledAt && !cfg.maintenanceEndsAt) return;
          const acquired = await acquireRedisLock("lock:maintenance-cron", 50);
          if (!acquired) return;
          try {
            await applyMaintenanceSchedule(cfg);
          } finally {
            await releaseRedisLock("lock:maintenance-cron");
          }
        } catch (err) {
          captureException(err instanceof Error ? err : new Error(String(err)), { job: "maintenance-cron" });
        }
      });
    });

    process.on("SIGTERM", async () => {
      logger.info("📋 SIGTERM received, shutting down");
      server.close(async () => {
        await prisma.$disconnect();
        logger.info("✓ Processes cleared. Exiting.");
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error("❌ FATAL: Server startup crashed", { error: error.message });
  }
};

startServer();
