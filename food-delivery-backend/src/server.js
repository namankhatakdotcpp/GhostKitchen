import dotenv from "dotenv";
import http from "http";

// Load environment variables FIRST, before anything else
dotenv.config({ path: ".env" });

import app from "./app.js";
import { env } from "./config/env.js";
import { initSocket } from "./socket/socketServer.js";
import { startOrderTimeoutJob } from "./jobs/orderTimeout.job.js";
import { logger } from "./utils/logger.js";

const server = http.createServer(app);

// Initialize Socket.IO for real-time updates
initSocket(server);

// Start background jobs
startOrderTimeoutJob();

logger.info("🚀 Starting GhostKitchen Backend...", {
  database: env.DATABASE_URL?.split("/").pop() || "unknown",
  cashfreeEnv: env.CASHFREE_ENV,
  nodeEnv: env.NODE_ENV,
});

server.listen(env.PORT, () => {
  logger.info("✓ Server running successfully", {
    port: env.PORT,
    websocket: "initialized",
    jobs: "started",
    status: "ready",
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("📋 SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("✓ Server closed");
    process.exit(0);
  });
});
