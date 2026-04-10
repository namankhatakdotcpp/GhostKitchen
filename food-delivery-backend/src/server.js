import dotenv from "dotenv";
import http from "http";

// 1. Load env before EVERYTHING
dotenv.config({ path: ".env" });

import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
import { connectRedis } from "./config/redis.js";
import { initSocket } from "./socket/socketServer.js";
import { startOrderTimeoutJob } from "./jobs/orderTimeout.job.js";
import { logger } from "./utils/logger.js";

// Global Async Error Safety
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", { reason, promise });
});
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error: error.message, stack: error.stack });
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
        await initSocket(server);
      } catch (socketError) {
        logger.error("❌ Socket initialization failed", { error: socketError.message });
      }

      // Background jobs safely
      try {
        startOrderTimeoutJob();
      } catch (jobError) {
        logger.error("❌ Job initialisation failed", { error: jobError.message });
      }
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
