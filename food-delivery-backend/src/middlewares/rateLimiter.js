/**
 * Rate Limiter Middleware
 * 
 * Uses Redis to track requests per IP
 * Prevents:
 * - Brute force attacks
 * - DDoS attacks
 * - API abuse
 * 
 * Configuration:
 * - windowMs: Time window (15 minutes)
 * - max: Max requests per window (100)
 * - keyGenerator: How to identify user (IP by default)
 */

import { cacheIncrement } from "../utils/cache.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/AppError.js";

/**
 * Create a rate limiter middleware
 * 
 * @param {object} options - Configuration
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Max requests per window
 * @param {string} options.message - Error message
 * @param {function} options.keyGenerator - Function to get rate limit key
 * @returns {function} Express middleware
 */
export const createRateLimiter = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // 100 requests
    message = "Too many requests, please try again later",
    keyGenerator = (req) => req.ip,
  } = options;

  const ttl = Math.ceil(windowMs / 1000); // Convert to seconds

  return async (req, res, next) => {
    try {
      // Get rate limit key (usually IP address)
      const key = `ratelimit:${keyGenerator(req)}`;

      // Increment counter
      const count = await cacheIncrement(key, 1, ttl);

      // Add rate limit headers
      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));
      res.setHeader("X-RateLimit-Reset", Math.ceil(Date.now() / 1000) + ttl);

      // Check if limit exceeded
      if (count > max) {
        logger.warn("Rate limit exceeded", {
          ip: req.ip,
          key,
          count,
          max,
          path: req.path,
        });

        return next(
          new AppError(
            message,
            429, // 429 Too Many Requests
            {
              retryAfter: ttl,
            }
          )
        );
      }

      // Log rate limit stats
      if (count === 1) {
        logger.debug(`Rate limit tracking started`, {
          ip: req.ip,
          windowMs,
          max,
        });
      }

      next();
    } catch (error) {
      // Fail open - don't block requests if rate limiting fails
      logger.error("Rate limiter error", {
        error: error.message,
        ip: req.ip,
      });
      next();
    }
  };
};

/**
 * Pre-configured rate limiters
 */

// General API rate limiter
export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP
  message: "Too many API requests, please try again later",
});

// Strict rate limiter for auth endpoints
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 login/register attempts
  message: "Too many login attempts, please try again later",
});

// Strict rate limiter for sensitive operations
export const strictLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 requests per hour
  message: "Too many requests to this resource, please try again later",
});

// Payment rate limiter (prevent payment spam)
export const paymentLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 payment attempts per minute
  message: "Too many payment attempts, please wait before trying again",
});
