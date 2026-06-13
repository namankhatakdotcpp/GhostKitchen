/**
 * Utils test suite
 * Covers: AppError, eta, sanitize, cache, audit, cashfree signature, password
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("../config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-at-least-32-chars-here", JWT_REFRESH_SECRET: "test-refresh-secret-32-chars-here", PORT: 5000 },
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config/prisma.js", () => ({
  prisma: {
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("../config/redis.js", () => ({
  getRedis: vi.fn(),
}));

const { AppError } = await import("../utils/AppError.js");
const { computeETA } = await import("../utils/eta.js");
const { sanitizeString, sanitizeObject } = await import("../utils/sanitize.js");
const { auditLog } = await import("../utils/audit.js");
const { verifyCashfreeSignature } = await import("../utils/cashfree.js");
const { getRedis } = await import("../config/redis.js");
const { cacheGet, cacheSet, cacheDelete, cacheDeletePattern, cacheOrFetch, cacheDel, CACHE_KEYS } = await import("../utils/cache.js");
const { prisma } = await import("../config/prisma.js");

// ── AppError ──────────────────────────────────────────────────────────────────
describe("AppError", () => {
  it("extends Error with statusCode", () => {
    const e = new AppError("Not found", 404);
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toBe("Not found");
    expect(e.statusCode).toBe(404);
    expect(e.isOperational).toBe(true);
  });

  it("stores optional code", () => {
    const e = new AppError("Duplicate", 409, "DUPLICATE");
    expect(e.code).toBe("DUPLICATE");
  });

  it("has null code by default", () => {
    const e = new AppError("oops", 500);
    expect(e.code).toBeNull();
  });

  it("has a stack trace", () => {
    const e = new AppError("stack test", 400);
    expect(e.stack).toBeTruthy();
  });
});

// ── computeETA ────────────────────────────────────────────────────────────────
describe("computeETA", () => {
  const restaurant = { lat: 28.6139, lng: 77.209, address: { prepTime: 20 } };

  it("returns a future Date for CONFIRMED", () => {
    const eta = computeETA(restaurant, null, "CONFIRMED", null);
    expect(eta).toBeInstanceOf(Date);
    expect(eta.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns a future Date for PREPARING", () => {
    const eta = computeETA(restaurant, null, "PREPARING", null);
    expect(eta).toBeInstanceOf(Date);
    expect(eta.getTime()).toBeGreaterThan(Date.now());
  });

  it("calculates distance-based ETA for OUT_FOR_DELIVERY", () => {
    const agent = { currentLat: 28.62, currentLng: 77.21 };
    const deliveryAddress = { lat: 28.6, lng: 77.2 };
    const eta = computeETA(restaurant, agent, "OUT_FOR_DELIVERY", deliveryAddress);
    expect(eta).toBeInstanceOf(Date);
    expect(eta.getTime()).toBeGreaterThan(Date.now());
  });

  it("uses defaults when agent has no coords for OUT_FOR_DELIVERY", () => {
    const agent = { currentLat: null, currentLng: null };
    const eta = computeETA(restaurant, agent, "OUT_FOR_DELIVERY", null);
    expect(eta).toBeInstanceOf(Date);
  });

  it("falls through to default for unknown status", () => {
    const eta = computeETA(restaurant, null, "PLACED", null);
    expect(eta).toBeInstanceOf(Date);
  });

  it("handles null restaurant gracefully", () => {
    const eta = computeETA(null, null, "CONFIRMED", null);
    expect(eta).toBeInstanceOf(Date);
  });

  it("uses deliveryTime from address if prepTime absent", () => {
    const r = { address: { deliveryTime: 25 } };
    const eta = computeETA(r, null, "CONFIRMED", null);
    expect(eta).toBeInstanceOf(Date);
    expect(eta.getTime()).toBeGreaterThan(Date.now());
  });
});

// ── sanitize ──────────────────────────────────────────────────────────────────
describe("sanitizeString", () => {
  it("strips <script> tags", () => {
    expect(sanitizeString('<script>alert("xss")</script>')).toBe("");
  });

  it("strips HTML tags", () => {
    expect(sanitizeString("<b>hello</b>")).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(sanitizeString("  hello  ")).toBe("hello");
  });

  it("passes through non-string values unchanged", () => {
    expect(sanitizeString(42)).toBe(42);
    expect(sanitizeString(null)).toBeNull();
    expect(sanitizeString(undefined)).toBeUndefined();
  });

  it("preserves normal text", () => {
    expect(sanitizeString("Hello, World!")).toBe("Hello, World!");
  });
});

describe("sanitizeObject", () => {
  it("sanitizes string values in an object", () => {
    const result = sanitizeObject({ name: "<b>Alice</b>", age: 25 });
    expect(result.name).toBe("Alice");
    expect(result.age).toBe(25);
  });

  it("sanitizes nested objects", () => {
    const result = sanitizeObject({ user: { name: "<script>bad</script>ok" } });
    expect(result.user.name).toBe("ok");
  });

  it("sanitizes arrays", () => {
    const result = sanitizeObject(["<b>a</b>", "normal"]);
    expect(result[0]).toBe("a");
    expect(result[1]).toBe("normal");
  });

  it("sanitizes array values inside objects", () => {
    const result = sanitizeObject({ tags: ["<b>one</b>", "two"] });
    expect(result.tags[0]).toBe("one");
    expect(result.tags[1]).toBe("two");
  });

  it("returns non-object/non-array values as-is", () => {
    expect(sanitizeObject(42)).toBe(42);
    expect(sanitizeObject(null)).toBeNull();
    expect(sanitizeObject("raw")).toBe("raw");
  });

  it("handles nested array of objects", () => {
    const result = sanitizeObject({ items: [{ name: "<i>x</i>" }] });
    expect(result.items[0].name).toBe("x");
  });
});

// ── auditLog ──────────────────────────────────────────────────────────────────
describe("auditLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an audit log entry", async () => {
    prisma.auditLog.create.mockResolvedValue({ id: "al-1" });
    const req = { ip: "127.0.0.1", get: vi.fn().mockReturnValue("Mozilla") };
    await auditLog({ userId: "u-1", action: "LOGIN", entityType: "User", entityId: "u-1", meta: {}, req });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "LOGIN" }) })
    );
  });

  it("logs without crashing when prisma throws", async () => {
    prisma.auditLog.create.mockRejectedValue(new Error("DB error"));
    await expect(auditLog({ userId: "u-1", action: "FAIL", req: null })).resolves.toBeUndefined();
  });

  it("works without a req object", async () => {
    prisma.auditLog.create.mockResolvedValue({ id: "al-2" });
    await auditLog({ userId: "u-2", action: "LOGOUT", entityType: "User", req: null });
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
  });
});

// ── verifyCashfreeSignature ───────────────────────────────────────────────────
describe("verifyCashfreeSignature", () => {
  it("returns true for a valid signature", () => {
    const crypto = require("crypto");
    const secret = "test-secret";
    const body = '{"order_id":"GK-ABC123"}';
    const sig = crypto.createHmac("sha256", secret).update(body).digest("base64");
    expect(verifyCashfreeSignature(body, sig, secret)).toBe(true);
  });

  it("returns false for an invalid signature", () => {
    expect(verifyCashfreeSignature('{"a":1}', "bad-sig", "secret")).toBe(false);
  });

  it("returns false when signature length differs", () => {
    expect(verifyCashfreeSignature('{"a":1}', "short", "secret")).toBe(false);
  });
});

// ── cache ─────────────────────────────────────────────────────────────────────
describe("cache utils (Redis unavailable)", () => {
  beforeEach(() => {
    vi.mocked(getRedis).mockReturnValue(null);
  });

  it("cacheGet returns null when redis is null", async () => {
    expect(await cacheGet("key")).toBeNull();
  });

  it("cacheSet silently skips when redis is null", async () => {
    await expect(cacheSet("key", { a: 1 })).resolves.toBeUndefined();
  });

  it("cacheDelete silently skips when redis is null", async () => {
    await expect(cacheDelete("k1", "k2")).resolves.toBeUndefined();
  });

  it("cacheDeletePattern returns 0 when redis is null", async () => {
    expect(await cacheDeletePattern("prefix:*")).toBe(0);
  });

  it("cacheDel is an alias for cacheDelete", async () => {
    await expect(cacheDel("key")).resolves.toBeUndefined();
  });

  it("cacheOrFetch calls fetchFn and returns result", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ data: 42 });
    const result = await cacheOrFetch("key", fetchFn, 60);
    expect(result).toEqual({ data: 42 });
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});

describe("cache utils (Redis available — setex path)", () => {
  const mockRedis = {
    get: vi.fn(),
    setex: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
  };

  beforeEach(() => {
    vi.mocked(getRedis).mockReturnValue(mockRedis);
    vi.clearAllMocks();
  });

  it("cacheGet returns parsed value from redis", async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ value: 1 }));
    const result = await cacheGet("k");
    expect(result).toEqual({ value: 1 });
  });

  it("cacheGet returns null on error", async () => {
    mockRedis.get.mockRejectedValue(new Error("redis down"));
    expect(await cacheGet("k")).toBeNull();
  });

  it("cacheGet returns null when redis returns null", async () => {
    mockRedis.get.mockResolvedValue(null);
    expect(await cacheGet("k")).toBeNull();
  });

  it("cacheSet uses setex when available", async () => {
    mockRedis.setex.mockResolvedValue("OK");
    await cacheSet("k", { x: 1 }, 120);
    expect(mockRedis.setex).toHaveBeenCalledWith("k", 120, JSON.stringify({ x: 1 }));
  });

  it("cacheSet uses r.set when setex not a function", async () => {
    const rNoSetex = { ...mockRedis, setex: undefined, set: vi.fn() };
    vi.mocked(getRedis).mockReturnValue(rNoSetex);
    await cacheSet("k", { x: 1 }, 60);
    expect(rNoSetex.set).toHaveBeenCalled();
  });

  it("cacheDelete calls del", async () => {
    mockRedis.del.mockResolvedValue(1);
    await cacheDelete("k1", "k2");
    expect(mockRedis.del).toHaveBeenCalledWith("k1", "k2");
  });

  it("cacheDeletePattern deletes matched keys", async () => {
    mockRedis.keys.mockResolvedValue(["a:1", "a:2"]);
    mockRedis.del.mockResolvedValue(2);
    const count = await cacheDeletePattern("a:*");
    expect(count).toBe(2);
  });

  it("cacheDeletePattern returns 0 when no keys match", async () => {
    mockRedis.keys.mockResolvedValue([]);
    expect(await cacheDeletePattern("nomatch:*")).toBe(0);
  });

  it("cacheDeletePattern returns 0 when keys not a function", async () => {
    const rNoKeys = { ...mockRedis, keys: undefined };
    vi.mocked(getRedis).mockReturnValue(rNoKeys);
    expect(await cacheDeletePattern("a:*")).toBe(0);
  });

  it("cacheOrFetch returns cached value without calling fetchFn", async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ cached: true }));
    const fetchFn = vi.fn();
    const result = await cacheOrFetch("k", fetchFn, 60);
    expect(result).toEqual({ cached: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("cacheOrFetch does not cache null fetchFn result", async () => {
    mockRedis.get.mockResolvedValue(null);
    const fetchFn = vi.fn().mockResolvedValue(null);
    const result = await cacheOrFetch("k", fetchFn, 60);
    expect(result).toBeNull();
    expect(mockRedis.setex).not.toHaveBeenCalled();
  });
});

// ── CACHE_KEYS helpers ────────────────────────────────────────────────────────
describe("CACHE_KEYS", () => {
  it("ANALYTICS returns scoped key", () => {
    const key = CACHE_KEYS.ANALYTICS("rest-1", "week");
    expect(key).toContain("analytics:rest-1:week");
  });

  it("MENU returns scoped key", () => {
    expect(CACHE_KEYS.MENU("rest-1")).toBe("menu:rest-1");
  });

  it("RESTAURANT returns scoped key", () => {
    expect(CACHE_KEYS.RESTAURANT("rest-1")).toBe("restaurant:rest-1");
  });

  it("USER returns scoped key", () => {
    expect(CACHE_KEYS.USER("u-1")).toBe("user:u-1");
  });
});
