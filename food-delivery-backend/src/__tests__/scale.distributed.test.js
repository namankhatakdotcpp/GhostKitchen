/**
 * Horizontal Scaling / Distributed Systems Tests
 *
 * Verifies that multi-instance correctness properties hold:
 *  1. Redis distributed lock: only one instance runs a guarded job per cycle
 *  2. Lock contention: second caller correctly backs off
 *  3. Fail-open: lock is skipped (not blocking) when Redis is down
 *  4. Lock release: explicit release frees the key; TTL cleans up after crash
 *  5. SiteConfig Redis cache: invalidation propagates across instances
 *  6. Cache miss path: stale local cache bypassed by Redis invalidation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-at-least-32-chars-here",
    JWT_REFRESH_SECRET: "test-refresh-secret-32-chars-here",
    CASHFREE_APP_ID: "test",
    CASHFREE_SECRET_KEY: "test",
    CASHFREE_ENV: "sandbox",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:5000",
    ALLOWED_ORIGINS: "http://localhost:3000",
    PORT: 5000,
    NODE_ENV: "test",
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Shared mock Redis store that can be configured per test
const mockStore = { keys: new Map(), setResult: "OK" };
const mockRedis = {
  setex: vi.fn(), // presence → detected as ioredis
  set: vi.fn(async (key, _val, _ex, ttl, _nx) => {
    if (mockStore.keys.has(key)) return null; // NX: key exists → fail
    mockStore.keys.set(key, { ttl });
    return mockStore.setResult;
  }),
  del: vi.fn(async (key) => {
    mockStore.keys.delete(key);
    return 1;
  }),
  get: vi.fn(async (key) => mockStore.keys.get(key)?.val ?? null),
};

let redisEnabled = true;
vi.mock("../config/redis.js", () => ({
  getRedis: vi.fn(() => (redisEnabled ? mockRedis : null)),
  connectRedis: vi.fn().mockResolvedValue(undefined),
  redisHealthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
}));

vi.mock("../config/prisma.js", () => ({
  prisma: {
    siteConfig: { upsert: vi.fn() },
  },
}));

vi.mock("../socket/socketServer.js", () => ({
  emitToAll: vi.fn(),
}));

vi.mock("../services/email.service.js", () => ({
  sendMaintenanceEmail: vi.fn().mockResolvedValue(undefined),
}));

// Import under test
const { acquireRedisLock, releaseRedisLock } = await import("../utils/redisLock.js");
const { getSiteConfigCached, invalidateConfigCache, updateSiteConfig } = await import(
  "../modules/config/config.service.js"
);
const { prisma } = await import("../config/prisma.js");

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetStore() {
  mockStore.keys.clear();
  mockStore.setResult = "OK";
  vi.clearAllMocks();
  // Re-attach the NX logic after clearAllMocks
  mockRedis.set.mockImplementation(async (key, _val, _ex, _ttl, _nx) => {
    if (mockStore.keys.has(key)) return null;
    mockStore.keys.set(key, { val: "1" });
    return "OK";
  });
  mockRedis.get.mockImplementation(async (key) => mockStore.keys.get(key)?.val ?? null);
  mockRedis.del.mockImplementation(async (key) => { mockStore.keys.delete(key); return 1; });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Distributed Lock — acquireRedisLock
// ═════════════════════════════════════════════════════════════════════════════

describe("acquireRedisLock", () => {
  beforeEach(() => {
    redisEnabled = true;
    resetStore();
  });

  it("returns true when the lock key is free (first instance wins)", async () => {
    const result = await acquireRedisLock("lock:test-job", 60);
    expect(result).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledOnce();
  });

  it("returns false when the lock is already held (second instance backs off)", async () => {
    await acquireRedisLock("lock:test-job", 60); // first instance acquires
    const result = await acquireRedisLock("lock:test-job", 60); // second instance
    expect(result).toBe(false);
  });

  it("returns true when Redis is unavailable — fail-open, all instances run", async () => {
    redisEnabled = false;
    const result = await acquireRedisLock("lock:test-job", 60);
    expect(result).toBe(true);
  });

  it("returns true when Redis.set throws — fail-open, never silently blocks jobs", async () => {
    mockRedis.set.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await acquireRedisLock("lock:test-job", 60);
    expect(result).toBe(true);
  });

  it("passes EX and NX to Redis so the lock is atomic and auto-expiring", async () => {
    await acquireRedisLock("lock:test-job", 90);
    const [key, val, ex, ttl, nx] = mockRedis.set.mock.calls[0];
    expect(key).toBe("lock:test-job");
    expect(val).toBe("1");
    expect(ex).toBe("EX");
    expect(ttl).toBe(90);
    expect(nx).toBe("NX");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Distributed Lock — releaseRedisLock
// ═════════════════════════════════════════════════════════════════════════════

describe("releaseRedisLock", () => {
  beforeEach(() => {
    redisEnabled = true;
    resetStore();
  });

  it("deletes the lock key so the next acquire succeeds", async () => {
    await acquireRedisLock("lock:test-job", 60);
    await releaseRedisLock("lock:test-job");
    const result = await acquireRedisLock("lock:test-job", 60);
    expect(result).toBe(true);
  });

  it("is a no-op when Redis is unavailable", async () => {
    redisEnabled = false;
    await expect(releaseRedisLock("lock:test-job")).resolves.toBeUndefined();
  });

  it("is non-fatal when Redis.del throws", async () => {
    mockRedis.del.mockRejectedValueOnce(new Error("network error"));
    await expect(releaseRedisLock("lock:test-job")).resolves.toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Lock contention — simulating two instance lifecycles
// ═════════════════════════════════════════════════════════════════════════════

describe("Lock contention — two-instance job lifecycle", () => {
  beforeEach(() => {
    redisEnabled = true;
    resetStore();
  });

  it("only one of two concurrent acquire calls succeeds", async () => {
    // Both instances try to acquire at the same time
    const [a, b] = await Promise.all([
      acquireRedisLock("lock:incident-engine", 110),
      acquireRedisLock("lock:incident-engine", 110),
    ]);
    // Exactly one succeeds
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect([a, b].filter((v) => !v)).toHaveLength(1);
  });

  it("after the winning instance releases, the next cycle winner acquires cleanly", async () => {
    const first = await acquireRedisLock("lock:incident-engine", 110);
    expect(first).toBe(true);
    // winning instance finishes job and releases
    await releaseRedisLock("lock:incident-engine");
    // next cycle — any instance can win
    const second = await acquireRedisLock("lock:incident-engine", 110);
    expect(second).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. SiteConfig Redis cache — cross-instance invalidation
// ═════════════════════════════════════════════════════════════════════════════

describe("SiteConfig — Redis-backed cross-instance cache", () => {
  const BASE_CONFIG = { id: "singleton", maintenanceMode: false, maintenanceScheduledAt: null, maintenanceEndsAt: null };

  beforeEach(async () => {
    redisEnabled = true;
    resetStore();
    vi.clearAllMocks();
    // Reset the module-level in-process cache by invalidating
    await invalidateConfigCache();
    // Re-clear mocks since invalidateConfigCache touches mockRedis
    vi.clearAllMocks();
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.get.mockResolvedValue(null); // default: Redis cache miss
    mockRedis.del.mockResolvedValue(1);
    prisma.siteConfig.upsert.mockResolvedValue(BASE_CONFIG);
  });

  it("fetches from DB on first call and populates Redis", async () => {
    const cfg = await getSiteConfigCached();
    expect(cfg).toMatchObject({ maintenanceMode: false });
    expect(prisma.siteConfig.upsert).toHaveBeenCalledOnce();
    // cacheSet detects ioredis via setex presence and calls r.setex
    expect(mockRedis.setex).toHaveBeenCalled();
  });

  it("serves from Redis cache on second call (skips DB)", async () => {
    // Simulate Redis hit
    mockRedis.get.mockResolvedValue(JSON.stringify(BASE_CONFIG));
    const cfg = await getSiteConfigCached();
    expect(cfg).toMatchObject(BASE_CONFIG);
    expect(prisma.siteConfig.upsert).not.toHaveBeenCalled();
  });

  it("invalidateConfigCache deletes the Redis key (cross-instance propagation)", async () => {
    await invalidateConfigCache();
    expect(mockRedis.del).toHaveBeenCalledWith("siteconfig:singleton");
  });

  it("after invalidation, next getSiteConfigCached hits DB again (stale local cache bypassed)", async () => {
    // Warm the local cache via a DB hit
    await getSiteConfigCached();
    // Simulate another instance updating config (deletes Redis key)
    await invalidateConfigCache();
    // Redis is now empty — next call must hit DB
    mockRedis.get.mockResolvedValue(null);
    prisma.siteConfig.upsert.mockResolvedValue({ ...BASE_CONFIG, maintenanceMode: true });
    const fresh = await getSiteConfigCached();
    expect(fresh.maintenanceMode).toBe(true);
    expect(prisma.siteConfig.upsert).toHaveBeenCalledTimes(2); // initial + post-invalidation
  });

  it("falls back to DB when Redis is unavailable (cache miss path)", async () => {
    redisEnabled = false;
    const cfg = await getSiteConfigCached();
    expect(cfg).toMatchObject(BASE_CONFIG);
    expect(prisma.siteConfig.upsert).toHaveBeenCalledOnce();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. updateSiteConfig — awaits cache invalidation
// ═════════════════════════════════════════════════════════════════════════════

describe("updateSiteConfig — invalidation is awaited before return", () => {
  beforeEach(async () => {
    redisEnabled = true;
    vi.clearAllMocks();
    mockRedis.del.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.get.mockResolvedValue(null);
    prisma.siteConfig.upsert.mockResolvedValue({
      id: "singleton", maintenanceMode: true, maintenanceScheduledAt: null, maintenanceEndsAt: null,
    });
    await invalidateConfigCache();
    vi.clearAllMocks();
    mockRedis.del.mockResolvedValue(1);
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.get.mockResolvedValue(null);
    prisma.siteConfig.upsert.mockResolvedValue({
      id: "singleton", maintenanceMode: true, maintenanceScheduledAt: null, maintenanceEndsAt: null,
    });
  });

  it("calls del on siteconfig:singleton after writing to DB", async () => {
    await updateSiteConfig({ maintenanceMode: true });
    expect(prisma.siteConfig.upsert).toHaveBeenCalledOnce();
    expect(mockRedis.del).toHaveBeenCalledWith("siteconfig:singleton");
  });
});
