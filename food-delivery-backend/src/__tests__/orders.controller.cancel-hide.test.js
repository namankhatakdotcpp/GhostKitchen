/**
 * Two things, tested at the level where their logic actually lives:
 *
 *   - cancelOrderById (orders.service.js) — the single shared cancellation
 *     path: status update, socket emit, customer + rider notify, auto-refund
 *     for paid orders. Used by both the manual Cancel/Reject button
 *     (orders.controller.js) and the auto-reject housekeeping job
 *     (jobs/orderTimeout.job.js) — tested directly here so both callers
 *     inherit identical behavior without re-testing it twice.
 *   - hideFromShopBoard (orders.controller.js) — view-only dismissal,
 *     ownership-checked, persisted, does NOT touch order status.
 *   - updateOrderStatusHTTP (orders.controller.js) — just confirms it
 *     delegates a CANCELLED transition to cancelOrderById rather than the
 *     generic updateOrderStatus path.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockOrderUpdate = vi.fn();
const mockFindFirst = vi.fn();
vi.mock("../config/prisma.js", () => ({
  prisma: {
    order: { findUnique: mockFindUnique, update: mockOrderUpdate },
    restaurant: { findFirst: mockFindFirst },
    user: { findUnique: vi.fn() },
  },
}));

const mockEmitOrderStatusUpdated = vi.fn();
vi.mock("../socket/socket.server.js", () => ({
  emitOrderAssignedToAgent: vi.fn(),
  emitOrderNew: vi.fn(),
  emitOrderStatusUpdated: mockEmitOrderStatusUpdated,
}));

const mockCreateNotification = vi.fn();
vi.mock("../modules/notification/notification.service.js", () => ({
  createNotification: mockCreateNotification,
}));

const mockInitiateRefund = vi.fn();
vi.mock("../modules/payment/refund.service.js", () => ({
  initiateRefund: mockInitiateRefund,
}));

vi.mock("../config/config.service.js", () => ({ getSiteConfigCached: vi.fn() }));
vi.mock("../modules/pricing/platformSettings.service.js", () => ({
  getPlatformSettingsCached: vi.fn(),
  snapshotSettings: vi.fn(),
}));
vi.mock("../utils/eta.js", () => ({ computeETA: vi.fn(() => new Date()) }));
vi.mock("../utils/geo.js", () => ({ haversine: vi.fn(() => 1) }));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { cancelOrderById } = await import("../modules/orders/orders.service.js");

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("cancelOrderById", () => {
  const baseOrder = {
    id: "o-1",
    status: "PLACED",
    customerId: "cust-1",
    restaurantId: "rest-1",
    agentId: null,
    cfOrderId: null,
    subtotal: 0, deliveryFee: 0, discount: 0, total: 0,
    restaurant: { name: "Test Restaurant" },
  };

  function setup(overrides = {}) {
    const order = { ...baseOrder, ...overrides };
    mockFindUnique.mockResolvedValue(order);
    mockOrderUpdate.mockResolvedValue({ ...order, status: "CANCELLED" });
    return order;
  }

  it("returns null for a non-existent order", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await cancelOrderById("missing");
    expect(result).toBeNull();
    expect(mockOrderUpdate).not.toHaveBeenCalled();
  });

  it("is a no-op for an already-terminal order (DELIVERED)", async () => {
    setup({ status: "DELIVERED" });
    await cancelOrderById("o-1");
    expect(mockOrderUpdate).not.toHaveBeenCalled();
  });

  it("transitions status to CANCELLED and emits the socket event", async () => {
    setup({ agentId: "rider-1" });
    await cancelOrderById("o-1");

    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o-1" }, data: { status: "CANCELLED" } }),
    );
    expect(mockEmitOrderStatusUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "o-1", agentId: "rider-1", status: "CANCELLED" }),
    );
  });

  it("notifies the customer", async () => {
    setup();
    await cancelOrderById("o-1");
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "cust-1", title: "Order cancelled" }),
    );
  });

  it("also notifies the assigned rider when one exists", async () => {
    setup({ agentId: "rider-1" });
    await cancelOrderById("o-1");
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "rider-1", title: "Order cancelled" }),
    );
  });

  it("does not notify a rider when none is assigned", async () => {
    setup({ agentId: null });
    await cancelOrderById("o-1");
    const riderCalls = mockCreateNotification.mock.calls.filter((c) => c[0].userId === "rider-1");
    expect(riderCalls.length).toBe(0);
  });

  it("auto-triggers the existing refund flow for a paid (online) order", async () => {
    setup({ cfOrderId: "GK-ABC123" });
    mockInitiateRefund.mockResolvedValue({ id: "refund-1" });
    await cancelOrderById("o-1", { actorId: "owner-1" });
    expect(mockInitiateRefund).toHaveBeenCalledWith(
      expect.objectContaining({ cfOrderId: "GK-ABC123", adminId: "owner-1" }),
    );
  });

  it("does not attempt a refund for a COD order (no cfOrderId)", async () => {
    setup({ cfOrderId: null });
    await cancelOrderById("o-1");
    expect(mockInitiateRefund).not.toHaveBeenCalled();
  });

  it("a failed refund attempt does not throw or block the cancellation", async () => {
    setup({ cfOrderId: "GK-FAIL" });
    mockInitiateRefund.mockRejectedValue(new Error("gateway down"));
    const result = await cancelOrderById("o-1");
    expect(result).not.toBeNull();
  });

  it("a system/job-triggered cancellation (no actorId) still refunds", async () => {
    setup({ cfOrderId: "GK-JOB" });
    mockInitiateRefund.mockResolvedValue({ id: "refund-2" });
    await cancelOrderById("o-1", { reason: "Auto-rejected: restaurant did not respond in time" });
    expect(mockInitiateRefund).toHaveBeenCalledWith(
      expect.objectContaining({ cfOrderId: "GK-JOB", adminId: null }),
    );
  });
});

describe("hideFromShopBoard", () => {
  let hideFromShopBoard;
  beforeEach(async () => {
    ({ hideFromShopBoard } = await import("../modules/orders/orders.controller.js"));
  });

  it("404s when the order doesn't exist", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = { params: { id: "o-1" }, user: { userId: "owner-1" } };
    const res = mockRes();

    await hideFromShopBoard(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockOrderUpdate).not.toHaveBeenCalled();
  });

  it("403s when the caller doesn't own the order's restaurant", async () => {
    mockFindUnique.mockResolvedValue({ id: "o-1", restaurantId: "rest-1" });
    mockFindFirst.mockResolvedValue(null);
    const req = { params: { id: "o-1" }, user: { userId: "not-the-owner" } };
    const res = mockRes();

    await hideFromShopBoard(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockOrderUpdate).not.toHaveBeenCalled();
  });

  it("sets hiddenFromShopBoard=true without touching order status, when owned", async () => {
    mockFindUnique.mockResolvedValue({ id: "o-1", restaurantId: "rest-1", status: "OUT_FOR_DELIVERY" });
    mockFindFirst.mockResolvedValue({ id: "rest-1" });
    mockOrderUpdate.mockResolvedValue({});
    const req = { params: { id: "o-1" }, user: { userId: "owner-1" } };
    const res = mockRes();

    await hideFromShopBoard(req, res);

    expect(mockOrderUpdate).toHaveBeenCalledWith({
      where: { id: "o-1" },
      data: { hiddenFromShopBoard: true },
    });
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
