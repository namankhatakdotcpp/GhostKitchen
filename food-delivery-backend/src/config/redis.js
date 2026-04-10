import Redis from "ioredis";
import { logger } from "../utils/logger.js";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const isUpstash = REDIS_URL.includes("upstash");

const tlsOptions = isUpstash ? { tls: { rejectUnauthorized: false } } : {};

export const redis = new Redis(REDIS_URL, {
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

let isRedisReady = false;

export const connectRedis = async () => {
  try {
    await redis.connect();
    await redis.ping();
    isRedisReady = true;
  } catch (error) {
    logger.error("❌ Redis initialization failed. Running in fallback mode.", { error: error.message });
    isRedisReady = false;
  }
};

export const getRedis = () => {
  return isRedisReady && redis.status === "ready" ? redis : null;
};

export const redisHealthCheck = async () => {
  if (!getRedis()) return { status: "unhealthy", message: "Redis not connected or fallback mode active" };
  try {
    await redis.ping();
    return { status: "healthy", message: "Redis ready" };
  } catch (error) {
    return { status: "unhealthy", message: error.message };
  }
};

export const redisShutdown = async () => {
  try {
    if (redis.status === "ready") {
      await redis.quit();
      logger.info("✓ Redis closed gracefully");
    }
  } catch (error) {
    logger.error("Error closing Redis", { error: error.message });
  }
};

export default redis;
