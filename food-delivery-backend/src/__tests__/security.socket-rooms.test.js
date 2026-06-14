/**
 * Socket Room Ownership Hardening Tests
 *
 * Covers checkOrderRoomAccess — the async Prisma-backed gate that controls
 * who may join order-* Socket.IO rooms.
 *
 * Test matrix (all 7 required cases):
 *   1. Customer owns the order  → allowed
 *   2. Customer does NOT own it → denied
 *   3. Rider is assigned        → allowed
 *   4. Rider is NOT assigned    → denied
 *   5. Restaurant owns the order → allowed
 *   6. Different restaurant      → denied
 *   7. ADMIN role               → always allowed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-at-least-32-chars-here",
    JWT_REFRESH_SECRET: "test-refresh-secret-32-chars-here",
    CASHFREE_APP_ID: "test",
    CASHFREE_SECRET_KEY: "test-cashfree-secret",
    CASHFREE_CLIENT_SECRET: "test-cashfree-secret",
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

vi.mock("../config/redis.js", () => ({
  getRedis: vi.fn(() => null),
  redisHealthCheck: vi.fn().mockResolvedValue({ status: "healthy" }),
  connectRedis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../utils/jwt.js", () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock("../config/prisma.js", () => ({
  prisma: {
    order: { findUnique: vi.fn() },
  },
}));

const { checkOrderRoomAccess } = await import("../socket/socketServer.js");
const { prisma } = await import("../config/prisma.js");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ORDER_ID = "clxyz1234order";
const ORDER = { customerId: "u-cust", agentId: "u-rider", restaurantId: "rest-1" };

const customerUser   = { id: "u-cust",  roles: ["CUSTOMER"],              restaurantId: null };
const otherCustomer  = { id: "u-other", roles: ["CUSTOMER"],              restaurantId: null };
const assignedRider  = { id: "u-rider", roles: ["CUSTOMER", "DELIVERY"],  restaurantId: null };
const unassignedRider = { id: "u-other-rider", roles: ["CUSTOMER", "DELIVERY"], restaurantId: null };
const restaurantUser = { id: "u-rest",  roles: ["CUSTOMER", "RESTAURANT"], restaurantId: "rest-1" };
const otherRestUser  = { id: "u-rest2", roles: ["CUSTOMER", "RESTAURANT"], restaurantId: "rest-999" };
const adminUser      = { id: "u-admin", roles: ["CUSTOMER", "ADMIN"],      restaurantId: null };

describe("checkOrderRoomAccess — order-* room ownership gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.order.findUnique.mockResolvedValue(ORDER);
  });

  it("1. customer who owns the order is allowed", async () => {
    expect(await checkOrderRoomAccess(ORDER_ID, customerUser)).toBe(true);
    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: ORDER_ID },
      select: { customerId: true, agentId: true, restaurantId: true },
    });
  });

  it("2. customer who does NOT own the order is denied", async () => {
    expect(await checkOrderRoomAccess(ORDER_ID, otherCustomer)).toBe(false);
  });

  it("3. rider who is assigned to the order is allowed", async () => {
    expect(await checkOrderRoomAccess(ORDER_ID, assignedRider)).toBe(true);
  });

  it("4. rider who is NOT assigned to the order is denied", async () => {
    expect(await checkOrderRoomAccess(ORDER_ID, unassignedRider)).toBe(false);
  });

  it("5. restaurant that owns the order is allowed", async () => {
    expect(await checkOrderRoomAccess(ORDER_ID, restaurantUser)).toBe(true);
  });

  it("6. different restaurant cannot join another restaurant's order room (IDOR)", async () => {
    expect(await checkOrderRoomAccess(ORDER_ID, otherRestUser)).toBe(false);
  });

  it("7. ADMIN is always allowed — no DB query needed", async () => {
    expect(await checkOrderRoomAccess(ORDER_ID, adminUser)).toBe(true);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });

  describe("edge cases", () => {
    it("unauthenticated socket (user=null) is denied", async () => {
      expect(await checkOrderRoomAccess(ORDER_ID, null)).toBe(false);
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });

    it("order not found returns false", async () => {
      prisma.order.findUnique.mockResolvedValue(null);
      expect(await checkOrderRoomAccess(ORDER_ID, customerUser)).toBe(false);
    });

    it("order with no assigned rider does not match any rider", async () => {
      prisma.order.findUnique.mockResolvedValue({ ...ORDER, agentId: null });
      expect(await checkOrderRoomAccess(ORDER_ID, assignedRider)).toBe(false);
    });

    it("Prisma error causes fail-closed (false, not throw)", async () => {
      prisma.order.findUnique.mockRejectedValue(new Error("DB connection lost"));
      await expect(checkOrderRoomAccess(ORDER_ID, customerUser)).resolves.toBe(false);
    });

    it("empty orderId is rejected before DB query", async () => {
      expect(await checkOrderRoomAccess("", customerUser)).toBe(false);
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });

    it("orderId longer than 100 chars is rejected before DB query", async () => {
      expect(await checkOrderRoomAccess("x".repeat(101), customerUser)).toBe(false);
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });

    it("non-string orderId is rejected", async () => {
      expect(await checkOrderRoomAccess(null, customerUser)).toBe(false);
      expect(await checkOrderRoomAccess(123, customerUser)).toBe(false);
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });
  });
});
