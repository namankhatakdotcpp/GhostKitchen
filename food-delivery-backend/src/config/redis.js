import Redis from "ioredis";
import { logger } from "../utils/logger.js";

let redis = null;
let isRedisReady = false;

// Try to initialize Upstash Redis first
async function initUpstashRedis() {
  try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis: UpstashRedis } = await import("@upstash/redis");
      redis = new UpstashRedis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      logger.info("✓ Connected to Upstash Redis (REST API)");
      return true;
    }
  } catch (err) {
    logger.warn("⚠ Upstash Redis initialization failed:", err.message);
  }
  return false;
}

// Fallback to ioredis
async function initIORedis() {
  try {
    const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
    const isUpstash = REDIS_URL.includes("upstash");
    const tlsOptions = isUpstash ? { tls: { rejectUnauthorized: false } } : {};

    redis = new Redis(REDIS_URL, {
      ...tlsOptions,
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 5) {
          logger.warn("Redis retry limit reached. Falling back.");
          return null;
        }
        return Math.min(times * 100, 2000);
      },
      reconnectOnError: (err) => {
        return err.message.includes("READONLY");
      },
    });

    redis.on("connect", () => logger.info("✓ Redis connected successfully"));
    redis.on("error", (err) => logger.error("❌ Redis connection error", { error: err.message }));
    redis.on("close", () => logger.warn("⚠ Redis connection closed"));
    redis.on("reconnecting", () => logger.debug("🔄 Redis attempting to reconnect"));

    logger.info("✓ Connected to ioredis");
    return true;
  } catch (err) {
    logger.warn("⚠ ioredis initialization failed:", err.message);
    return false;
  }
}

export const connectRedis = async () => {
  try {
    // Try Upstash first
    const upstashSuccess = await initUpstashRedis();
    if (upstashSuccess) {
      isRedisReady = true;
      return;
    }

    // Fall back to ioredis
    const ioredisSuccess = await initIORedis();
    if (ioredisSuccess) {
      await redis.connect();
      await redis.ping();
      isRedisReady = true;
    } else {
      logger.warn("⚠ Redis disabled: no valid configuration found. App will run with in-memory fallback.");
      isRedisReady = false;
    }
  } catch (error) {
    logger.error("❌ Redis initialization failed. Running in fallback mode.", { error: error.message });
    isRedisReady = false;
  }
};

export const getRedis = () => {
  return isRedisReady && redis ? redis : null;
};

export const redisHealthCheck = async () => {
  if (!getRedis()) return { status: "unhealthy", message: "Redis not connected or fallback mode active" };
  try {
    if (redis.ping) {
      await redis.ping();
    } else {
      // Upstash Redis
      await redis.set("__health_check__", "ok");
      await redis.del("__health_check__");
    }
    return { status: "healthy", message: "Redis ready" };
  } catch (error) {
    return { status: "unhealthy", message: error.message };
  }
};

export const redisShutdown = async () => {
  try {
    if (redis && redis.quit) {
      await redis.quit();
      logger.info("✓ Redis closed gracefully");
    }
  } catch (error) {
    logger.error("Error closing Redis", { error: error.message });
  }
};

export { redis };
export default redis;

