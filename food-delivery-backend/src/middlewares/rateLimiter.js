import { cacheIncrement } from "../utils/cache.js";
import { logger } from "../utils/logger.js";
import AppError from "../utils/AppError.js";

const memoryStore = new Map();

export const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = "Too many requests, please try again later",
    keyGenerator = (req) => req.ip || "unknown-ip",
  } = options;

  const ttl = Math.ceil(windowMs / 1000);

  return async (req, res, next) => {
    try {
      const key = `ratelimit:${keyGenerator(req)}`;
      let count = 0;

      try {
        count = await cacheIncrement(key, 1, ttl);
        if (count === 0 || count === null) throw new Error("Redis unavailable");
      } catch (redisError) {
        const now = Date.now();
        const record = memoryStore.get(key) || { count: 0, expiresAt: now + windowMs };
        
        if (now > record.expiresAt) {
          record.count = 0;
          record.expiresAt = now + windowMs;
        }
        
        record.count += 1;
        memoryStore.set(key, record);
        count = record.count;
        
        if (Math.random() < 0.01) {
          for (const [k, v] of memoryStore.entries()) {
            if (Date.now() > v.expiresAt) memoryStore.delete(k);
          }
        }
      }

      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));

      if (count > max) {
        logger.warn("Rate limit exceeded", { ip: req.ip, key, count });
        return next(new AppError(message, 429, { retryAfter: ttl }));
      }
      next();
    } catch (error) {
      logger.error("Rate limiter global error", { error: error.message });
      next();
    }
  };
};

export const generalLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 100, message: "Too many API requests, please try again later" });
export const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, message: "Too many login attempts, please try again later" });
export const strictLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, max: 10, message: "Too many requests to this resource, please try again later" });
export const paymentLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 5, message: "Too many payment attempts, please wait before trying again" });
