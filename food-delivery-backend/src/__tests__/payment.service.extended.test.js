/**
 * Payment service extended tests
 * Covers: createOrderFromPayment, createPaymentSession, handlePaymentWebhook, verifyPaymentStatus
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-32-chars-here-padding",
    CASHFREE_APP_ID: "test-app-id",
    CASHFREE_SECRET: "test-secret-key",
    CASHFREE_ENV: "SANDBOX",
    FRONTEND_URL: "http://localhost:3000",
  },
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockCashfree = {
  PGCreateOrder: vi.fn(),
  PGFetchOrder: vi.fn(),
  PGOrderFetchPayments: vi.fn(),
};

vi.mock("../config/cashfree.js", () => ({
  default: mockCashfree,
}));

const mockPrisma = {
  order: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  coupon: { findUnique: vi.fn(), updateMany: vi.fn() },
  payment: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  paymentWebhook: { findUnique: vi.fn(), create: vi.fn() },
  wallet: { upsert: vi.fn(), updateMany: vi.fn() },
  // Default: run the callback with mockPrisma as the tx (tests override for webhook tests)
  $transaction: vi.fn().mockImplementation(async (fn) => fn(mockPrisma)),
};

vi.mock("../config/prisma.js", () => ({
  prisma: mockPrisma,
}));
vi.mock("../socket/socket.server.js", () => ({
  emitOrderNew: vi.fn(),
}));
vi.mock("../modules/notification/notification.service.js", () => ({
  createNotification: vi.fn(),
}));
vi.mock("../modules/orders/orders.service.js", () => ({
  calculateOrderTotal: vi.fn(),
}));
vi.mock("../modules/config/config.service.js", () => ({
  getSiteConfigCached: vi.fn().mockResolvedValue({ autoConfirmOrders: false }),
}));
vi.mock("../modules/wallet/wallet.service.js", () => ({
  claimPointsInTx: vi.fn().mockResolvedValue(undefined),
}));

const { calculateOrderTotal } = await import("../modules/orders/orders.service.js");
const { createOrderFromPayment, createPaymentSession, handlePaymentWebhook, verifyPaymentStatus } = await import("../modules/payment/payment.service.js");

beforeEach(() => {
  vi.clearAllMocks();
  // Re-apply default $transaction implementation after clearAllMocks wipes it
  mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
});

// ── createOrderFromPayment ────────────────────────────────────────────────────
describe("createOrderFromPayment", () => {
  const basePayment = {
    id: "pay-1",
    cfOrderId: "cf-order-1",
    customerId: "u-1",
    restaurantId: "rest-1",
    couponCode: null,
    itemsSnapshot: JSON.stringify({
      orderItems: [{ menuItemId: "mi-1", quantity: 2, price: 20000, name: "Pizza" }],
      subtotal: 40000,
      deliveryFee: 3000,
      discount: 0,
      total: 43000,
    }),
    deliveryAddress: JSON.stringify({ street: "1 Road", city: "Delhi" }),
  };

  it("returns existing order if already created (idempotent)", async () => {
    const existing = { id: "ord-exist", cfOrderId: "cf-order-1" };
    mockPrisma.order.findFirst.mockResolvedValue(existing);

    const result = await createOrderFromPayment(basePayment);
    expect(result).toEqual(existing);
  });

  it("creates order from snapshot on success", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);
    const newOrder = { id: "ord-1", cfOrderId: "cf-order-1", restaurant: { id: "rest-1", ownerId: "owner-1" } };
    mockPrisma.order.create.mockResolvedValue(newOrder);

    const result = await createOrderFromPayment(basePayment);
    expect(result.id).toBe("ord-1");
    expect(mockPrisma.order.create).toHaveBeenCalledOnce();
  });

  it("falls back to legacy snapshot and recalculates totals", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);
    const legacyPayment = {
      ...basePayment,
      itemsSnapshot: JSON.stringify([{ menuItemId: "mi-1", quantity: 2 }]),
    };
    calculateOrderTotal.mockResolvedValue({
      orderItems: [{ menuItemId: "mi-1", quantity: 2, price: 20000 }],
      subtotal: 40000,
      deliveryFee: 3000,
      discount: 0,
      total: 43000,
    });
    const newOrder = { id: "ord-2", cfOrderId: "cf-order-1", restaurant: { id: "rest-1", ownerId: null } };
    mockPrisma.order.create.mockResolvedValue(newOrder);

    const result = await createOrderFromPayment(legacyPayment);
    expect(result.id).toBe("ord-2");
    expect(calculateOrderTotal).toHaveBeenCalledOnce();
  });

  it("increments coupon usedCount when coupon used", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);
    const paymentWithCoupon = { ...basePayment, couponCode: "SAVE10" };
    const order = { id: "ord-3", cfOrderId: "cf-order-1", restaurant: { ownerId: null } };
    mockPrisma.order.create.mockResolvedValue(order);
    mockPrisma.coupon.findUnique.mockResolvedValue({ maxUses: 100 });
    mockPrisma.coupon.updateMany.mockResolvedValue({ count: 1 });

    await createOrderFromPayment(paymentWithCoupon);

    expect(mockPrisma.coupon.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usedCount: { lt: 100 } }),
      })
    );
  });

  it("handles concurrent creation race (P2002) by returning existing order", async () => {
    mockPrisma.order.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "ord-race", cfOrderId: "cf-order-1" });
    const p2002 = new Error("Unique constraint");
    p2002.code = "P2002";
    mockPrisma.order.create.mockRejectedValue(p2002);

    const result = await createOrderFromPayment(basePayment);
    expect(result.id).toBe("ord-race");
  });

  it("handles Postgres serialization failure by returning existing order", async () => {
    // Serializable isolation causes Postgres to abort one of two concurrent
    // transactions with "could not serialize access due to concurrent update".
    // The catch block must treat this identically to P2002.
    // When $transaction rejects outright (before callback runs), the catch
    // block's findFirst is the first — and only — findFirst call.
    mockPrisma.order.findFirst.mockResolvedValueOnce({ id: "ord-serial", cfOrderId: "cf-order-1" });
    const serializeErr = new Error("could not serialize access due to concurrent update");
    mockPrisma.$transaction.mockRejectedValueOnce(serializeErr);

    const result = await createOrderFromPayment(basePayment);
    expect(result.id).toBe("ord-serial");
  });

  it("does not increment coupon when coupon not found", async () => {
    mockPrisma.order.findFirst.mockResolvedValue(null);
    const paymentWithCoupon = { ...basePayment, couponCode: "GHOST" };
    mockPrisma.order.create.mockResolvedValue({ id: "ord-4", cfOrderId: "cf-order-1", restaurant: { ownerId: null } });
    mockPrisma.coupon.findUnique.mockResolvedValue(null);

    await createOrderFromPayment(paymentWithCoupon);

    expect(mockPrisma.coupon.updateMany).not.toHaveBeenCalled();
  });
});

// ── handlePaymentWebhook ──────────────────────────────────────────────────────
describe("handlePaymentWebhook", () => {
  const successWebhook = {
    data: {
      order: { order_id: "GK-rest1-cf123", order_amount: 430 },
      payment: { payment_status: "SUCCESS", cf_payment_id: "CF-PAY-1" },
    },
  };

  it("returns true on success webhook processing", async () => {
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        paymentWebhook: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
        payment: {
          findUnique: vi.fn().mockResolvedValue({ id: "pay-1", cfOrderId: "GK-rest1-cf123", amount: 43000 }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return fn(tx);
    });
    // For the order creation after becameSuccess
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      cfOrderId: "GK-rest1-cf123",
      customerId: "u-1",
      restaurantId: "rest-1",
      couponCode: null,
      itemsSnapshot: JSON.stringify({ orderItems: [], subtotal: 0, deliveryFee: 0, discount: 0, total: 0 }),
      deliveryAddress: JSON.stringify({ street: "1 Road" }),
    });
    mockPrisma.order.findFirst.mockResolvedValue({ id: "ord-1", cfOrderId: "GK-rest1-cf123" });

    const result = await handlePaymentWebhook(successWebhook);
    expect(result).toBe(true);
  });

  it("processes duplicate webhook as already-processed (returns early in tx)", async () => {
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        paymentWebhook: { findUnique: vi.fn().mockResolvedValue({ id: "wh-1" }), create: vi.fn() },
        payment: { findUnique: vi.fn(), updateMany: vi.fn() },
      };
      return fn(tx);
    });

    const result = await handlePaymentWebhook(successWebhook);
    expect(result).toBe(true);
  });

  it("processes FAILED webhook", async () => {
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        paymentWebhook: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
        payment: {
          findUnique: vi.fn().mockResolvedValue({ id: "pay-2", cfOrderId: "GK-fail-cf", amount: 43000 }),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };
      return fn(tx);
    });

    const failWebhook = {
      data: {
        order: { order_id: "GK-fail-cf", order_amount: 430 },
        payment: { payment_status: "FAILED", cf_payment_id: "CF-PAY-FAIL" },
      },
    };

    const result = await handlePaymentWebhook(failWebhook);
    expect(result).toBe(true);
  });

  it("throws when webhook data has no orderId", async () => {
    mockPrisma.$transaction.mockImplementation(async (fn) => {
      const tx = { paymentWebhook: { findUnique: vi.fn() }, payment: { findUnique: vi.fn() } };
      return fn(tx);
    });

    const badWebhook = { data: { order: {}, payment: {} } };
    await expect(handlePaymentWebhook(badWebhook)).rejects.toThrow();
  });
});

// ── verifyPaymentStatus ───────────────────────────────────────────────────────
describe("verifyPaymentStatus", () => {
  it("returns Cashfree response on success", async () => {
    const mockResponse = [{ payment_status: "SUCCESS", cf_payment_id: "CF-123" }];
    mockCashfree.PGOrderFetchPayments.mockResolvedValue(mockResponse);

    const result = await verifyPaymentStatus("ord-1");

    expect(result).toEqual(mockResponse);
    expect(mockCashfree.PGOrderFetchPayments).toHaveBeenCalledWith("ord-1");
  });

  it("throws AppError when Cashfree call fails", async () => {
    mockCashfree.PGOrderFetchPayments.mockRejectedValue(new Error("Network error"));

    await expect(verifyPaymentStatus("ord-bad")).rejects.toMatchObject({ statusCode: 500 });
  });
});

// ── createPaymentSession ──────────────────────────────────────────────────────
describe("createPaymentSession", () => {
  it("throws 404 when order not found", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);

    await expect(createPaymentSession("ord-ghost", { userId: "u-1" })).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 when requester is not the order owner", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: "ord-1",
      customerId: "u-owner",
      total: 43000,
      customer: { id: "u-owner", name: "Owner", email: "o@o.com", phone: "9999999999" },
    });

    await expect(createPaymentSession("ord-1", { userId: "u-other" })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("creates Cashfree payment session and returns session data", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: "ord-1",
      customerId: "u-1",
      total: 43000,
      customer: { id: "u-1", name: "Alice", email: "a@a.com", phone: "9999999999" },
    });
    mockCashfree.PGCreateOrder.mockResolvedValue({
      order_id: "ord-1",
      payment_session_id: "sess-abc123",
      order_amount: "430.00",
      order_currency: "INR",
    });

    const result = await createPaymentSession("ord-1", { userId: "u-1" });

    expect(result.payment_session_id).toBe("sess-abc123");
    expect(mockCashfree.PGCreateOrder).toHaveBeenCalledOnce();
  });
});
