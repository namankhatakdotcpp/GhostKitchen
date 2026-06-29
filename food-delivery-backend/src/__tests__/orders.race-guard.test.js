/**
 * Race-guard unit tests for the updateOrderStatus fix (commit 4d4b541).
 *
 * Tests two layers:
 *   1. Service layer — orders.service.js:updateOrderStatus returns null when
 *      prisma.order.update throws P2025, so the winning writer's side effects
 *      are not duplicated by a losing concurrent writer.
 *   2. Controller layer — updateOrderStatusHTTP skips awardPointsForOrder and
 *      processReferralReward when updateOrderStatus returns null, and instead
 *      re-fetches the order's actual current state before responding.
 *
 * True concurrency testing (two goroutine-style callers racing against a live
 * DB) requires a real Postgres instance and is not practical in this vitest
 * + mocked-Prisma harness. These tests cover the deterministic logic path
 * that the race guard enforces: P2025 caught → null returned → side effects
 * skipped. The atomicity guarantee comes from Postgres row-level locking
 * combined with the conditional WHERE clause.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared Prisma mock ──────────────────────────────────────────────────────
const mockOrderUpdate = vi.fn();
const mockOrderFindUnique = vi.fn();

vi.mock("../config/prisma.js", () => ({
  prisma: {
    order: { update: mockOrderUpdate, findUnique: mockOrderFindUnique, findMany: vi.fn(), create: vi.fn() },
    restaurant: { findUnique: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    cODSettlement: { upsert: vi.fn() },
    wallet: { findUnique: vi.fn(), update: vi.fn() },
    menuItem: { findMany: vi.fn() },
    coupon: { findUnique: vi.fn() },
    siteConfig: { upsert: vi.fn() },
  },
}));

// ── Other dependency mocks ──────────────────────────────────────────────────
vi.mock("../socket/socket.server.js", () => ({
  emitOrderStatusUpdated: vi.fn(),
  emitOrderNew: vi.fn(),
  emitOrderAssignedToAgent: vi.fn(),
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../utils/eta.js", () => ({
  computeETA: vi.fn(() => new Date()),
}));

vi.mock("../utils/geo.js", () => ({
  haversine: vi.fn(() => 1),
}));

vi.mock("../modules/config/config.service.js", () => ({
  getSiteConfigCached: vi.fn().mockResolvedValue({ defaultDeliveryFee: 3000 }),
}));

vi.mock("../modules/pricing/platformSettings.service.js", () => ({
  getPlatformSettingsCached: vi.fn().mockResolvedValue({}),
  snapshotSettings: vi.fn(),
}));

vi.mock("../modules/notification/notification.service.js", () => ({
  createNotification: vi.fn(),
}));

// wallet.service.js is imported by both orders.service.js (claimPointsInTx)
// and orders.controller.js (awardPointsForOrder). Both must be in one mock.
const mockAwardPointsForOrder = vi.fn();
vi.mock("../modules/wallet/wallet.service.js", () => ({
  claimPointsInTx: vi.fn(),
  awardPointsForOrder: mockAwardPointsForOrder,
}));

const mockProcessReferralReward = vi.fn();
vi.mock("../modules/referral/referral.service.js", () => ({
  processReferralReward: mockProcessReferralReward,
}));

vi.mock("../modules/dispatch/dispatch.service.js", () => ({
  assignDeliveryAgent: vi.fn(),
  calculateOrderTotal: vi.fn(),
}));

vi.mock("../modules/push/push.service.js", () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/email.service.js", () => ({
  sendOrderPlacedEmail: vi.fn(),
  sendOrderStatusEmail: vi.fn(),
}));

// ── Import subjects under test ──────────────────────────────────────────────
const { updateOrderStatus } = await import("../modules/orders/orders.service.js");
const { updateOrderStatusHTTP } = await import("../modules/orders/orders.controller.js");

// ── Helpers ─────────────────────────────────────────────────────────────────

function p2025() {
  const err = new Error("Record to update not found");
  err.code = "P2025";
  return err;
}

const baseDbOrder = {
  id: "o-1",
  status: "OUT_FOR_DELIVERY",
  customerId: "cust-1",
  restaurantId: "rest-1",
  agentId: "rider-1",
  cfOrderId: null,
  subtotal: 0, deliveryFee: 0, discount: 0, total: 0,
  itemTotal: null, restaurantPackaging: null, gstOnItemTotal: null,
  gstOnDeliveryFee: null, platformFee: null, gstOnPlatformFee: null,
  distanceKm: null, restaurantPayout: null, riderPayout: null,
  adminRevenue: null, donationAmountPaise: null,
  estimatedDelivery: null, placedAt: null, acceptedAt: null,
  readyAt: null, pickedUpAt: null, deliveredAt: null,
  restaurant: null, agent: null, items: [],
};

function mockReq(overrides = {}) {
  return {
    params: { id: "o-1" },
    body: { status: "DELIVERED" },
    user: { userId: "rider-1", role: "DELIVERY" },
    app: { locals: { io: null } },
    ...overrides,
  };
}

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => vi.clearAllMocks());

// ── Service-level tests ─────────────────────────────────────────────────────

describe("updateOrderStatus — fromStatus conditional WHERE guard", () => {
  it("returns null when prisma.order.update throws P2025 (concurrent writer won the race)", async () => {
    mockOrderUpdate.mockRejectedValue(p2025());
    const result = await updateOrderStatus({
      orderId: "o-1",
      status: "DELIVERED",
      fromStatus: "OUT_FOR_DELIVERY",
    });
    expect(result).toBeNull();
  });

  it("re-throws errors that are not P2025 (network failure, constraint violations, etc.)", async () => {
    const networkErr = new Error("connection refused");
    mockOrderUpdate.mockRejectedValue(networkErr);
    await expect(
      updateOrderStatus({ orderId: "o-1", status: "DELIVERED", fromStatus: "OUT_FOR_DELIVERY" }),
    ).rejects.toThrow("connection refused");
  });

  it("passes { id: orderId, status: fromStatus } in the WHERE clause when fromStatus is provided", async () => {
    mockOrderUpdate.mockResolvedValue({ ...baseDbOrder, status: "DELIVERED" });
    await updateOrderStatus({ orderId: "o-1", status: "DELIVERED", fromStatus: "OUT_FOR_DELIVERY" });
    const whereArg = mockOrderUpdate.mock.calls[0][0].where;
    expect(whereArg).toEqual({ id: "o-1", status: "OUT_FOR_DELIVERY" });
  });

  it("passes only { id: orderId } in the WHERE clause when fromStatus is omitted (backward-compat)", async () => {
    mockOrderUpdate.mockResolvedValue({ ...baseDbOrder, status: "DELIVERED" });
    await updateOrderStatus({ orderId: "o-1", status: "DELIVERED" });
    const whereArg = mockOrderUpdate.mock.calls[0][0].where;
    expect(whereArg).toEqual({ id: "o-1" });
    expect(whereArg).not.toHaveProperty("status");
  });
});

// ── Controller-level tests ──────────────────────────────────────────────────

describe("updateOrderStatusHTTP — null return from updateOrderStatus (race lost)", () => {
  beforeEach(() => {
    // First findUnique call: getOrderById before the update attempt (currentOrder)
    mockOrderFindUnique.mockResolvedValueOnce({
      ...baseDbOrder,
      status: "OUT_FOR_DELIVERY",
      agentId: "rider-1",
    });
    // update throws P2025 — concurrent writer already set DELIVERED
    mockOrderUpdate.mockRejectedValue(p2025());
    // Second findUnique call: getOrderById re-fetch after null return
    mockOrderFindUnique.mockResolvedValueOnce({
      ...baseDbOrder,
      status: "DELIVERED",
      agentId: "rider-1",
    });
  });

  it("responds with the re-fetched current order, not the stale pre-write snapshot", async () => {
    const req = mockReq();
    const res = mockRes();
    await updateOrderStatusHTTP(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Order status updated successfully",
        order: expect.objectContaining({ id: "o-1", status: "DELIVERED" }),
      }),
    );
  });

  it("does not call awardPointsForOrder when the race is lost", async () => {
    const req = mockReq();
    const res = mockRes();
    await updateOrderStatusHTTP(req, res);
    expect(mockAwardPointsForOrder).not.toHaveBeenCalled();
  });

  it("does not call processReferralReward when the race is lost", async () => {
    const req = mockReq();
    const res = mockRes();
    await updateOrderStatusHTTP(req, res);
    expect(mockProcessReferralReward).not.toHaveBeenCalled();
  });

  it("calls getOrderById a second time to fetch the current order after the race is lost", async () => {
    const req = mockReq();
    const res = mockRes();
    await updateOrderStatusHTTP(req, res);
    // findUnique is called once for pre-update read, once for post-null re-fetch
    expect(mockOrderFindUnique).toHaveBeenCalledTimes(2);
  });
});
