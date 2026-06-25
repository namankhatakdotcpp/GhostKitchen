/**
 * orders.controller.js — new behavior only:
 *   - hideFromShopBoard: view-only dismissal, ownership-checked, persisted
 *   - updateOrderStatusHTTP's CANCELLED branch: notifies customer + assigned
 *     rider, and auto-triggers the existing refund flow for paid orders
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetOrderById = vi.fn();
const mockUpdateOrderStatus = vi.fn();
const mockAssignDeliveryAgent = vi.fn();
vi.mock("../modules/orders/orders.service.js", () => ({
  assignDeliveryAgent: mockAssignDeliveryAgent,
  calculateOrderTotal: vi.fn(),
  createOrder: vi.fn(),
  getOrderById: mockGetOrderById,
  listOrders: vi.fn(),
  updateOrderStatus: mockUpdateOrderStatus,
}));

const mockFindFirst = vi.fn();
const mockOrderUpdate = vi.fn();
vi.mock("../config/prisma.js", () => ({
  prisma: {
    restaurant: { findFirst: mockFindFirst },
    order: { update: mockOrderUpdate },
    user: { findUnique: vi.fn() },
  },
}));

vi.mock("../modules/orders/orders.validation.js", () => ({
  validateCreateOrder: vi.fn(),
  validateStatusUpdate: vi.fn(() => null),
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

vi.mock("../services/email.service.js", () => ({
  sendOrderPlacedEmail: vi.fn(),
  sendOrderStatusEmail: vi.fn(),
}));

vi.mock("../utils/eta.js", () => ({
  computeETA: vi.fn(() => new Date()),
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockInitiateRefund = vi.fn();
vi.mock("../modules/payment/refund.service.js", () => ({
  initiateRefund: mockInitiateRefund,
}));

const { hideFromShopBoard, updateOrderStatusHTTP } = await import("../modules/orders/orders.controller.js");

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("hideFromShopBoard", () => {
  it("404s when the order doesn't exist", async () => {
    mockGetOrderById.mockResolvedValue(null);
    const req = { params: { id: "o-1" }, user: { userId: "owner-1" } };
    const res = mockRes();

    await hideFromShopBoard(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockOrderUpdate).not.toHaveBeenCalled();
  });

  it("403s when the caller doesn't own the order's restaurant", async () => {
    mockGetOrderById.mockResolvedValue({ id: "o-1", restaurantId: "rest-1" });
    mockFindFirst.mockResolvedValue(null); // not owned by this user
    const req = { params: { id: "o-1" }, user: { userId: "not-the-owner" } };
    const res = mockRes();

    await hideFromShopBoard(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockOrderUpdate).not.toHaveBeenCalled();
  });

  it("sets hiddenFromShopBoard=true without touching order status, when owned", async () => {
    mockGetOrderById.mockResolvedValue({ id: "o-1", restaurantId: "rest-1", status: "OUT_FOR_DELIVERY" });
    mockFindFirst.mockResolvedValue({ id: "rest-1" }); // owned
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

describe("updateOrderStatusHTTP — CANCELLED", () => {
  const baseOrder = {
    id: "o-1",
    status: "PLACED",
    customerId: "cust-1",
    restaurantId: "rest-1",
    agentId: null,
    cfOrderId: null,
    estimatedDelivery: null,
    restaurant: { name: "Test Restaurant" },
  };

  function setup(orderOverrides = {}, updatedOverrides = {}) {
    const order = { ...baseOrder, ...orderOverrides };
    mockGetOrderById.mockResolvedValue(order);
    mockFindFirst.mockResolvedValue({ id: "rest-1" }); // RESTAURANT owns it
    mockUpdateOrderStatus.mockResolvedValue({ ...order, status: "CANCELLED", ...updatedOverrides });
    return order;
  }

  it("notifies the customer on cancellation", async () => {
    setup();
    const req = { params: { id: "o-1" }, body: { status: "CANCELLED" }, user: { role: "RESTAURANT", userId: "owner-1" }, app: { locals: {} } };
    const res = mockRes();

    await updateOrderStatusHTTP(req, res);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "cust-1", title: "Order cancelled" })
    );
  });

  it("also notifies the assigned rider when one exists", async () => {
    setup({ agentId: "rider-1" }, { agentId: "rider-1" });
    const req = { params: { id: "o-1" }, body: { status: "CANCELLED" }, user: { role: "RESTAURANT", userId: "owner-1" }, app: { locals: {} } };
    const res = mockRes();

    await updateOrderStatusHTTP(req, res);

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "rider-1", title: "Order cancelled" })
    );
  });

  it("does not notify a rider when none is assigned", async () => {
    setup({ agentId: null }, { agentId: null });
    const req = { params: { id: "o-1" }, body: { status: "CANCELLED" }, user: { role: "RESTAURANT", userId: "owner-1" }, app: { locals: {} } };
    const res = mockRes();

    await updateOrderStatusHTTP(req, res);

    const riderCalls = mockCreateNotification.mock.calls.filter((c) => c[0].userId === "rider-1");
    expect(riderCalls.length).toBe(0);
  });

  it("auto-triggers the existing refund flow for a paid (online) order", async () => {
    setup({ cfOrderId: "GK-ABC123" }, { cfOrderId: "GK-ABC123" });
    mockInitiateRefund.mockResolvedValue({ id: "refund-1" });
    const req = { params: { id: "o-1" }, body: { status: "CANCELLED" }, user: { role: "RESTAURANT", userId: "owner-1" }, app: { locals: {} } };
    const res = mockRes();

    await updateOrderStatusHTTP(req, res);
    // Refund is fired in a non-awaited async IIFE — flush microtasks
    await new Promise((r) => setTimeout(r, 0));

    expect(mockInitiateRefund).toHaveBeenCalledWith(
      expect.objectContaining({ cfOrderId: "GK-ABC123", adminId: "owner-1" })
    );
  });

  it("does not attempt a refund for a COD order (no cfOrderId)", async () => {
    setup({ cfOrderId: null }, { cfOrderId: null });
    const req = { params: { id: "o-1" }, body: { status: "CANCELLED" }, user: { role: "RESTAURANT", userId: "owner-1" }, app: { locals: {} } };
    const res = mockRes();

    await updateOrderStatusHTTP(req, res);
    await new Promise((r) => setTimeout(r, 0));

    expect(mockInitiateRefund).not.toHaveBeenCalled();
  });

  it("a failed refund attempt does not block the cancellation response", async () => {
    setup({ cfOrderId: "GK-FAIL" }, { cfOrderId: "GK-FAIL" });
    mockInitiateRefund.mockRejectedValue(new Error("gateway down"));
    const req = { params: { id: "o-1" }, body: { status: "CANCELLED" }, user: { role: "RESTAURANT", userId: "owner-1" }, app: { locals: {} } };
    const res = mockRes();

    await updateOrderStatusHTTP(req, res);
    await new Promise((r) => setTimeout(r, 0));

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Order status updated successfully" })
    );
  });

  it("passes agentId through to emitOrderStatusUpdated so the rider's room gets the push", async () => {
    setup({ agentId: "rider-1" }, { agentId: "rider-1" });
    const req = {
      params: { id: "o-1" }, body: { status: "CANCELLED" },
      user: { role: "RESTAURANT", userId: "owner-1" }, app: { locals: { io: {} } },
    };
    const res = mockRes();

    await updateOrderStatusHTTP(req, res);

    expect(mockEmitOrderStatusUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "rider-1", status: "CANCELLED" })
    );
  });
});
