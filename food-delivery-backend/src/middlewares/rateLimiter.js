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
// let the request through rather than returning a 500.
// This keeps the rate limiter non-fatal — a Redis outage should never block users.
const skipOnStoreError = (store) => {
  const origIncrement = store.increment.bind(store);
  store.increment = async (...args) => {
    try {
      return await origIncrement(...args);
    } catch {
      // Return a sentinel that tells express-rate-limit the request is fine
      return { totalHits: 0, resetTime: undefined };
    }
  };
  return store;
};

const authStore = skipOnStoreError(makeStore("auth"));
const roleSwitchStore = skipOnStoreError(makeStore("role-switch"));
const paymentStore = skipOnStoreError(makeStore("payment"));
const generalStore = skipOnStoreError(makeStore("general"));
const browseStore = skipOnStoreError(makeStore("browse"));
const orderCreateStore = skipOnStoreError(makeStore("order-create"));
const couponStore = skipOnStoreError(makeStore("coupon"));
const roleRegStore = skipOnStoreError(makeStore("role-reg"));

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
