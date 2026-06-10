import { getRedis } from "../config/redis.js";

// Safe get — returns null on any error or when Redis unavailable
export const cacheGet = async (key) => {
  const r = getRedis();
  if (!r) return null;
  try {
    const val = await r.get(key);
    if (val === null || val === undefined) return null;
    return JSON.parse(typeof val === "string" ? val : JSON.stringify(val));
  } catch { return null; }
};

// Safe set — silently skips when Redis unavailable
export const cacheSet = async (key, value, ttlSec = 300) => {
  const r = getRedis();
  if (!r) return;
  try {
    const str = JSON.stringify(value);
    // ioredis: setex exists; Upstash REST: set with { ex }
    if (typeof r.setex === "function") {
      await r.setex(key, ttlSec, str);
    } else {
      await r.set(key, str, { ex: ttlSec });
    }
  } catch { /* non-fatal */ }
};

export const cacheDelete = async (...keys) => {
  const r = getRedis();
  if (!r || keys.length === 0) return;
  try { await r.del(...keys); } catch { /* non-fatal */ }
};

// Alias used in older call sites
export const cacheDel = cacheDelete;

export const cacheDeletePattern = async (pattern) => {
  const r = getRedis();
  if (!r) return 0;
  try {
    if (typeof r.keys !== "function") return 0;
    const keys = await r.keys(pattern);
    if (keys.length === 0) return 0;
    await r.del(...keys);
    return keys.length;
  } catch { return 0; }
};

// Read-through helper
export const cacheOrFetch = async (key, fetchFn, ttlSec = 300) => {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;
  const result = await fetchFn();
  if (result !== null && result !== undefined) {
    await cacheSet(key, result, ttlSec);
  }
  return result;
};

export const CACHE_KEYS = {
  ANALYTICS: (restaurantId, range) => `analytics:${restaurantId}:${range}:${new Date().toISOString().slice(0, 10)}`,
  MENU: (restaurantId) => `menu:${restaurantId}`,
  RESTAURANT: (restaurantId) => `restaurant:${restaurantId}`,
  USER: (userId) => `user:${userId}`,
};

export const CACHE_TTL = {
  ANALYTICS: 300,   // 5 min
  MENU: 120,        // 2 min
  RESTAURANT: 300,  // 5 min
  USER: 900,        // 15 min
};
