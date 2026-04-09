/**
 * Redis Configuration
 * 
 * Handles:
 * - Connection pooling
 * - Error handling
 * - Pub/Sub for Socket.IO distribution
 * - Generic caching layer
 * 
 * WHY Redis:
 * - Session storage (faster than DB)
 * - Pub/Sub for Socket.IO adapter (horizontal scaling)
 * - Cache layer (reduce DB queries)
 * - Queue backend (BullMQ)
 */

import Redis from "ioredis";
import { logger } from "../utils/logger.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(REDIS_URL, {
  enableReadyCheck: false,
  enableOfflineQueue: false,
  maxRetriesPerRequest: null,
  // Connection pooling
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // Reconnection behavior
  reconnectOnError: (err) => {
    const targetError = "READONLY";
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
});

// Event handlers
redis.on("connect", () => {
  logger.info("✓ Redis connected successfully");
});

redis.on("error", (err) => {
  logger.error("❌ Redis connection error", {
    error: err.message,
    code: err.code,
  });
});

redis.on("close", () => {
  logger.warn("⚠ Redis connection closed");
});

redis.on("reconnecting", () => {
  logger.debug("🔄 Redis attempting to reconnect");
});

/**
 * Health check for Redis
 * Used in /health endpoint
 */
export const redisHealthCheck = async () => {
  try {
    await redis.ping();
    return { status: "healthy", message: "Redis connected" };
  } catch (error) {
    return { status: "unhealthy", message: error.message };
  }
};

/**
 * Graceful shutdown
 * Called when server is shutting down
 */
export const redisShutdown = async () => {
  try {
    await redis.quit();
    logger.info("✓ Redis connection closed gracefully");
  } catch (error) {
    logger.error("Error closing Redis connection", { error: error.message });
  }
};

export default redis;
