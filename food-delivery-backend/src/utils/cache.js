/**
 * Cache Layer Utilities
 * 
 * Provides simple abstraction for Redis caching
 * 
 * Benefits:
 * - Reduce database queries by 70-80%
 * - Faster response times (Redis << DB)
 * - Lower server load
 * - Auto-expiring keys (TTL)
 */

import { redis } from "../config/redis.js";
import { logger } from "../utils/logger.js";

/**
 * Get value from cache
 * 
 * @param {string} key - Cache key
 * @returns {Promise<any | null>} Cached value or null
 */
export const cacheGet = async (key) => {
  try {
    const data = await redis.get(key);
    if (data) {
      logger.debug(`Cache HIT: ${key}`);
      return JSON.parse(data);
    }
    logger.debug(`Cache MISS: ${key}`);
    return null;
  } catch (error) {
    logger.error(`Cache GET error: ${key}`, { error: error.message });
    return null; // Fail gracefully - fall back to DB query
  }
};

/**
 * Set value in cache with TTL
 * 
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds (default: 60)
 * @returns {Promise<void>}
 */
export const cacheSet = async (key, value, ttl = 60) => {
  try {
    const serialized = JSON.stringify(value);
    await redis.set(key, serialized, "EX", ttl);
    logger.debug(`Cache SET: ${key} (TTL: ${ttl}s)`);
  } catch (error) {
    logger.error(`Cache SET error: ${key}`, { error: error.message });
    // Fail gracefully - don't break the API
  }
};

/**
 * Delete cache key
 * 
 * @param {string} key - Cache key to delete
 * @returns {Promise<void>}
 */
export const cacheDelete = async (key) => {
  try {
    await redis.del(key);
    logger.debug(`Cache DELETE: ${key}`);
  } catch (error) {
    logger.error(`Cache DELETE error: ${key}`, { error: error.message });
  }
};

/**
 * Delete multiple cache keys by pattern
 * 
 * @param {string} pattern - Redis key pattern (e.g., "menu:*")
 * @returns {Promise<number>} Number of deleted keys
 */
export const cacheDeletePattern = async (pattern) => {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length === 0) {
      logger.debug(`Cache DELETE pattern: ${pattern} (no keys found)`);
      return 0;
    }

    await redis.del(...keys);
    logger.debug(`Cache DELETE pattern: ${pattern} (${keys.length} keys deleted)`);
    return keys.length;
  } catch (error) {
    logger.error(`Cache DELETE pattern error: ${pattern}`, { error: error.message });
    return 0;
  }
};

/**
 * Increment counter (for rate limiting, analytics)
 * 
 * @param {string} key - Counter key
 * @param {number} amount - Increment amount (default: 1)
 * @param {number} ttl - TTL for the counter
 * @returns {Promise<number>} New counter value
 */
export const cacheIncrement = async (key, amount = 1, ttl = 3600) => {
  try {
    const value = await redis.incrby(key, amount);
    if (value === amount) {
      // First increment, set TTL
      await redis.expire(key, ttl);
    }
    return value;
  } catch (error) {
    logger.error(`Cache INCREMENT error: ${key}`, { error: error.message });
    return 0;
  }
};

/**
 * Cache with automatic fetch fallback
 * 
 * Pattern: Try cache, fallback to fetch function
 * 
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Function to call if cache miss
 * @param {number} ttl - Cache TTL
 * @returns {Promise<any>}
 */
export const cacheOrFetch = async (key, fetchFn, ttl = 60) => {
  try {
    // Try to get from cache
    const cached = await cacheGet(key);
    if (cached) {
      return cached;
    }

    // Cache miss - fetch from source
    logger.debug(`Cache MISS - fetching: ${key}`);
    const result = await fetchFn();

    // Store in cache for next time
    if (result) {
      await cacheSet(key, result, ttl);
    }

    return result;
  } catch (error) {
    logger.error(`cacheOrFetch error: ${key}`, { error: error.message });
    // If everything fails, return null and log error
    return null;
  }
};

/**
 * Predefined cache keys (convention)
 * 
 * Use consistent naming:
 * - menu:{restaurantId}
 * - restaurant:{restaurantId}
 * - user:{userId}
 * - order:{orderId}
 * - cart:{userId}
 */
export const CACHE_KEYS = {
  MENU: (restaurantId) => `menu:${restaurantId}`,
  RESTAURANT: (restaurantId) => `restaurant:${restaurantId}`,
  RESTAURANTS_LIST: () => "restaurants:list",
  USER: (userId) => `user:${userId}`,
  ORDER: (orderId) => `order:${orderId}`,
  CART: (userId) => `cart:${userId}`,
};

/**
 * Cache TTL values (in seconds)
 */
export const CACHE_TTL = {
  MENU: 120, // 2 minutes - changes often
  RESTAURANT: 300, // 5 minutes
  RESTAURANTS_LIST: 600, // 10 minutes
  USER: 900, // 15 minutes
  ORDER: 60, // 1 minute - real-time changes
  CART: 3600, // 1 hour
  STATS: 300, // 5 minutes
};
