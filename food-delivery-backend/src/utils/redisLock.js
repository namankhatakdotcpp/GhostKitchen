import { getRedis, getRedisClientType } from "../config/redis.js";
import { logger } from "./logger.js";

/**
 * Attempt to acquire a distributed Redis lock via SET NX EX.
 *
 * Returns true  — lock acquired; caller should run the job.
 * Returns false — lock already held by another instance; caller should skip.
 * Returns true  — when Redis is unavailable (fail-open); every instance runs.
 *
 * ttlSec should be set slightly below the job interval so the lock expires
 * automatically if the holder crashes before calling releaseRedisLock.
 *
 *   interval 2 min  → ttlSec 110
 *   interval 10 min → ttlSec 540
 *   interval 1 min  → ttlSec 50
 */
export const acquireRedisLock = async (key, ttlSec) => {
  const r = getRedis();
  if (!r) return true; // no Redis → no coordination; all instances run (single-process mode)
  try {
    let result;
    // Client type must come from config/redis.js's explicit tag, not
    // feature-detection: both ioredis AND @upstash/redis implement .setex(),
    // so `typeof r.setex === "function"` can't tell them apart. Using the
    // ioredis positional call against the Upstash client previously threw
    // "Cannot use 'in' operator to search for 'nx' in EX" on every lock
    // attempt — its SetCommand destructures (key, value, opts) and the
    // positional "EX" string ended up as opts, which it then tried `"nx" in`.
    if (getRedisClientType() === "ioredis") {
      result = await r.set(key, "1", "EX", ttlSec, "NX");
    } else {
      result = await r.set(key, "1", { nx: true, ex: ttlSec });
    }
    return result === "OK";
  } catch (err) {
    logger.warn("Redis lock acquisition failed, proceeding without lock", { key, error: err.message });
    return true; // fail-open — a Redis error must not silently stop all jobs
  }
};

/**
 * Release the lock. Non-fatal if Redis is unavailable — the TTL ensures the
 * lock expires on its own even if this call is never reached (e.g. process crash).
 */
export const releaseRedisLock = async (key) => {
  const r = getRedis();
  if (!r) return;
  try {
    await r.del(key);
  } catch {
    // TTL will clean up; do not rethrow
  }
};
