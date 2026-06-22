import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedis } from "../config/redis.js";

// Builds a RedisStore whose sendCommand is resolved lazily on each request.
// This means Redis does NOT need to be connected at module-import time.
// If Redis is unavailable when a request arrives, the store throws, and we
// fall back to the MemoryStore for that window — fail-open, never 500.
//
// For multi-instance production: set REDIS_URL (or Upstash credentials) so
// rate-limit counters are shared across all instances. Without it, each
// instance keeps its own counter and the per-IP limits are effectively
// multiplied by the instance count.
function makeStore(prefix) {
  const store = new RedisStore({
    sendCommand: async (...args) => {
      const r = getRedis();
      if (!r) throw new Error("Redis not connected");
      // Upstash REST client exposes r.call(); ioredis exposes r.sendCommand()
      if (typeof r.sendCommand === "function") return r.sendCommand(args);
      if (typeof r.call === "function") return r.call(...args);
      throw new Error("Redis client has no compatible sendCommand interface");
    },
    prefix: `rl:${prefix}:`,
  });
  return store;
}

// Shared skip function: when the Redis store throws (Redis down, network error),
// fall back to a real per-instance in-memory counter instead of swallowing the
// error with a fake result. A previous version returned { totalHits: 0 } as
// that sentinel, but express-rate-limit validates totalHits must be a positive
// integer — 0 failed that validation and threw on every single request whenever
// Redis was unreachable, turning "Redis outage" into "entire API down". This
// in-memory Map gives real (per-instance, not cross-instance) rate limiting
// during an outage instead, which is the actual fail-open behavior intended.
const skipOnStoreError = (store, windowMs) => {
  const origIncrement = store.increment.bind(store);
  const fallbackHits = new Map(); // key -> { count, resetTime }

  store.increment = async (...args) => {
    try {
      return await origIncrement(...args);
    } catch {
      const [key] = args;
      const now = Date.now();
      let entry = fallbackHits.get(key);
      if (!entry || entry.resetTime <= now) {
        entry = { count: 0, resetTime: now + windowMs };
        fallbackHits.set(key, entry);
      }
      entry.count += 1;
      return { totalHits: entry.count, resetTime: new Date(entry.resetTime) };
    }
  };
  return store;
};

const authStore = skipOnStoreError(makeStore("auth"), 15 * 60 * 1000);
const roleSwitchStore = skipOnStoreError(makeStore("role-switch"), 60 * 1000);
const paymentStore = skipOnStoreError(makeStore("payment"), 60 * 1000);
const generalStore = skipOnStoreError(makeStore("general"), 60 * 1000);
const browseStore = skipOnStoreError(makeStore("browse"), 60 * 1000);
const orderCreateStore = skipOnStoreError(makeStore("order-create"), 60 * 1000);
const couponStore = skipOnStoreError(makeStore("coupon"), 15 * 60 * 1000);
const roleRegStore = skipOnStoreError(makeStore("role-reg"), 60 * 60 * 1000);

// ── Auth endpoints — tightest limit ──────────────────────────────────────────
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  store: authStore,
});

// ── Role switching ─────────────────────────────────────────────────────────────
export const roleSwitchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Too many role switches." },
  standardHeaders: true,
  legacyHeaders: false,
  store: roleSwitchStore,
});

// ── Payment endpoints ─────────────────────────────────────────────────────────
export const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many payment requests." },
  standardHeaders: true,
  legacyHeaders: false,
  store: paymentStore,
});

// ── General API ────────────────────────────────────────────────────────────────
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { error: "Too many requests." },
  standardHeaders: true,
  legacyHeaders: false,
  store: generalStore,
});

// ── Browse/search ─────────────────────────────────────────────────────────────
export const browseLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: browseStore,
});

// ── Order creation ─────────────────────────────────────────────────────────────
export const orderCreationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many orders in a short period. Please wait." },
  standardHeaders: true,
  legacyHeaders: false,
  store: orderCreateStore,
});

// ── Coupon validation ─────────────────────────────────────────────────────────
export const couponValidateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many coupon validation attempts. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  store: couponStore,
});

// ── Role registration ─────────────────────────────────────────────────────────
export const roleRegistrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many registration attempts. Try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
  store: roleRegStore,
});
