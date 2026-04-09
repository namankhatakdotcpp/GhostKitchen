import dotenv from "dotenv";
import http from "http";

// Load environment variables FIRST, before anything else
dotenv.config({ path: ".env" });

import app from "./app.js";
import { env } from "./config/env.js";
import { createSocketServer } from "./socket/socket.server.js";
import { startOrderTimeoutJob } from "./jobs/orderTimeout.job.js";

const server = http.createServer(app);

createSocketServer(server);

// Start background jobs
startOrderTimeoutJob();

console.log("🚀 Starting GhostKitchen Backend...");
console.log(`   Database: ${env.DATABASE_URL?.split("/").pop() || "unknown"}`);
console.log(`   Cashfree: ${env.CASHFREE_ENV} environment`);

server.listen(env.PORT, () => {
  console.log(`✓ Server running on http://localhost:${env.PORT}`);
  console.log("✓ WebSocket server initialized");
  console.log("✓ Background jobs started");
  console.log("✓ Ready to accept requests");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("📋 SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("✓ Server closed");
    process.exit(0);
  });
});
