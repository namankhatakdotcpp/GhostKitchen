/**
 * Payment controller tests
 * Covers: createSession, webhook, verifyPayment, createPaymentOrder,
 *         verifyPaymentAndCreateOrder, getPaymentHistory, retryPayment
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-32-chars-padded-here",
    CASHFREE_SECRET_KEY: "cf-secret",
    CASHFREE_CLIENT_SECRET: "",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:8080",
  },
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../utils/cashfree.js", () => ({
  verifyCashfreeSignature: vi.fn(),
}));

const mockPrisma = {
  order: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  payment: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  user: { findUnique: vi.fn() },
};
vi.mock("../config/prisma.js", () => ({ prisma: mockPrisma }));

const mockCashfree = {
  PGCreateOrder: vi.fn(),
  PGFetchOrder: vi.fn(),
};
vi.mock("../config/cashfree.js", () => ({ default: mockCashfree }));

vi.mock("../modules/payment/payment.service.js", () => ({
  createPaymentSession: vi.fn(),
  handlePaymentWebhook: vi.fn(),
  verifyPaymentStatus: vi.fn(),
  createOrderFromPayment: vi.fn(),
}));

vi.mock("../modules/orders/orders.service.js", () => ({
  calculateOrderTotal: vi.fn(),
}));

vi.mock("uuid", () => ({ v4: () => "uuid-1234-5678-abcd" }));

const { verifyCashfreeSignature } = await import("../utils/cashfree.js");
const paymentService = await import("../modules/payment/payment.service.js");
const { calculateOrderTotal } = await import("../modules/orders/orders.service.js");
const {
  createSession, webhook, verifyPayment, createPaymentOrder,
  verifyPaymentAndCreateOrder, getPaymentHistory, retryPayment,
} = await import("../modules/payment/payment.controller.js");

function mockRes() {
  const r = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r;
}
const next = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyCashfreeSignature).mockReturnValue(true);
});

// ── createSession ─────────────────────────────────────────────────────────────
describe("createSession", () => {
  it("returns 400 when orderId is missing", async () => {
    const req = { body: {}, user: { userId: "u-1" } };
    const res = mockRes();
    await createSession(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("creates session and returns success", async () => {
    paymentService.createPaymentSession.mockResolvedValue({ payment_session_id: "sess-abc", order_id: "ord-1" });
    const req = { body: { orderId: "ord-1" }, user: { userId: "u-1" } };
    const res = mockRes();
    await createSession(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("calls next on service error", async () => {
    paymentService.createPaymentSession.mockRejectedValue(new Error("Service error"));
    const req = { body: { orderId: "ord-1" }, user: { userId: "u-1" } };
    const res = mockRes();
    await createSession(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── webhook ───────────────────────────────────────────────────────────────────
describe("webhook", () => {
  const webhookBody = JSON.stringify({
    data: {
      order: { order_id: "GK-rest1-cf123", order_amount: 430 },
      payment: { payment_status: "SUCCESS", cf_payment_id: "CF-PAY-1" },
    },
  });

  it("returns 200 with message when signature header is missing", async () => {
    const req = { headers: {}, body: {}, rawBody: null };
    const res = mockRes();
    await webhook(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    const call = res.json.mock.calls[0][0];
    expect(call.received).toBe(true);
  });

  it("returns 200 with fail message when signature is invalid", async () => {
    vi.mocked(verifyCashfreeSignature).mockReturnValue(false);
    const req = {
      headers: { "x-webhook-signature": "bad-sig" },
      body: webhookBody,
      rawBody: webhookBody,
    };
    const res = mockRes();
    await webhook(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].received).toBe(true);
  });

  it("processes valid webhook and returns success", async () => {
    paymentService.handlePaymentWebhook.mockResolvedValue(true);
    const req = {
      headers: { "x-webhook-signature": "valid-sig" },
      body: { data: { order: { order_id: "GK-1" }, payment: { payment_status: "SUCCESS" } } },
      rawBody: webhookBody,
    };
    const res = mockRes();
    await webhook(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].received).toBe(true);
  });

  it("handles Buffer rawBody", async () => {
    paymentService.handlePaymentWebhook.mockResolvedValue(true);
    const req = {
      headers: { "x-webhook-signature": "valid-sig" },
      body: Buffer.from(webhookBody),
      rawBody: Buffer.from(webhookBody),
    };
    const res = mockRes();
    await webhook(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 200 on JSON parse error", async () => {
    const badBody = "not json {{{";
    const req = {
      headers: { "x-webhook-signature": "valid-sig" },
      body: badBody,
      rawBody: badBody,
    };
    const res = mockRes();
    await webhook(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 200 even on unhandled error", async () => {
    paymentService.handlePaymentWebhook.mockRejectedValue(new Error("Unhandled"));
    const req = {
      headers: { "x-cf-signature": "valid-sig" },
      body: { data: {} },
      rawBody: webhookBody,
    };
    const res = mockRes();
    await webhook(req, res, next);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── verifyPayment ─────────────────────────────────────────────────────────────
describe("verifyPayment", () => {
  it("returns 400 when orderId is missing", async () => {
    const req = { params: {}, user: { userId: "u-1", role: "CUSTOMER" } };
    const res = mockRes();
    await verifyPayment(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("admin skips ownership check and returns status", async () => {
    paymentService.verifyPaymentStatus.mockResolvedValue([{ payment_status: "SUCCESS" }]);
    const req = { params: { orderId: "ord-1" }, user: { userId: "admin-1", role: "ADMIN" } };
    const res = mockRes();
    await verifyPayment(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns 404 when order not found (customer)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    const req = { params: { orderId: "ghost" }, user: { userId: "u-1", role: "CUSTOMER" } };
    const res = mockRes();
    await verifyPayment(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when customer does not own order", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ customerId: "other-user" });
    const req = { params: { orderId: "ord-1" }, user: { userId: "u-1", role: "CUSTOMER" } };
    const res = mockRes();
    await verifyPayment(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns status for order owner", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ customerId: "u-1" });
    paymentService.verifyPaymentStatus.mockResolvedValue([{ payment_status: "SUCCESS" }]);
    const req = { params: { orderId: "ord-1" }, user: { userId: "u-1", role: "CUSTOMER" } };
    const res = mockRes();
    await verifyPayment(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("calls next on service error", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ customerId: "u-1" });
    paymentService.verifyPaymentStatus.mockRejectedValue(new Error("Service error"));
    const req = { params: { orderId: "ord-1" }, user: { userId: "u-1", role: "CUSTOMER" } };
    const res = mockRes();
    await verifyPayment(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── createPaymentOrder ────────────────────────────────────────────────────────
describe("createPaymentOrder", () => {
  const validBody = {
    restaurantId: "rest-1",
    items: [{ menuItemId: "mi-1", quantity: 2 }],
    deliveryAddress: { street: "1 Road", city: "Delhi" },
  };

  it("returns 400 when required fields missing", async () => {
    const req = { body: {}, user: { userId: "u-1" } };
    const res = mockRes();
    await createPaymentOrder(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when customer not found", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const req = { body: validBody, user: { userId: "u-ghost" } };
    const res = mockRes();
    await createPaymentOrder(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 502 when Cashfree fails", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u-1", name: "Alice", email: "a@a.com", phone: "9999999999" });
    calculateOrderTotal.mockResolvedValue({ orderItems: [], subtotal: 40000, deliveryFee: 3000, discount: 0, total: 43000 });
    mockCashfree.PGCreateOrder.mockRejectedValue(new Error("CF down"));
    const req = { body: validBody, user: { userId: "u-1" } };
    const res = mockRes();
    await createPaymentOrder(req, res, next);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("creates order and returns session data", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u-1", name: "Alice", email: "a@a.com", phone: "9999999999" });
    calculateOrderTotal.mockResolvedValue({ orderItems: [], subtotal: 40000, deliveryFee: 3000, discount: 0, total: 43000 });
    mockCashfree.PGCreateOrder.mockResolvedValue({ payment_session_id: "sess-abc", order_id: "GK-UUID1234" });
    mockPrisma.payment.create.mockResolvedValue({ id: "pay-1" });

    const req = { body: validBody, user: { userId: "u-1" } };
    const res = mockRes();
    await createPaymentOrder(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ paymentSessionId: "sess-abc" }));
  });

  it("returns 400 on invalid items error", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u-1", name: "Alice", email: "a@a.com", phone: "9999999999" });
    calculateOrderTotal.mockRejectedValue(new Error("Invalid items: some items not found"));
    const req = { body: validBody, user: { userId: "u-1" } };
    const res = mockRes();
    await createPaymentOrder(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("calls next on unexpected error", async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error("DB error"));
    const req = { body: validBody, user: { userId: "u-1" } };
    const res = mockRes();
    await createPaymentOrder(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ── verifyPaymentAndCreateOrder ───────────────────────────────────────────────
describe("verifyPaymentAndCreateOrder", () => {
  it("returns 400 when cfOrderId is missing", async () => {
    const req = { body: {}, user: { userId: "u-1" } };
    const res = mockRes();
    await verifyPaymentAndCreateOrder(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when payment record not found", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(null);
    const req = { body: { cfOrderId: "GK-ghost" }, user: { userId: "u-1" } };
    const res = mockRes();
    await verifyPaymentAndCreateOrder(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when customer does not own payment", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({ customerId: "other-user", status: "PENDING" });
    const req = { body: { cfOrderId: "GK-1" }, user: { userId: "u-1" } };
    const res = mockRes();
    await verifyPaymentAndCreateOrder(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns existing order when payment already SUCCESS (idempotent)", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({ customerId: "u-1", status: "SUCCESS" });
    mockPrisma.order.findFirst.mockResolvedValue({ id: "ord-existing" });
    const req = { body: { cfOrderId: "GK-1" }, user: { userId: "u-1" } };
    const res = mockRes();
    await verifyPaymentAndCreateOrder(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, orderId: "ord-existing" }));
  });

  it("returns 502 when Cashfree fetch fails", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({ customerId: "u-1", status: "PENDING" });
    mockCashfree.PGFetchOrder.mockRejectedValue(new Error("CF down"));
    const req = { body: { cfOrderId: "GK-1" }, user: { userId: "u-1" } };
    const res = mockRes();
    await verifyPaymentAndCreateOrder(req, res, next);
    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("returns 400 when payment not completed", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({ customerId: "u-1", status: "PENDING" });
    mockCashfree.PGFetchOrder.mockResolvedValue({ data: { order_status: "ACTIVE" } });
    const req = { body: { cfOrderId: "GK-1" }, user: { userId: "u-1" } };
    const res = mockRes();
    await verifyPaymentAndCreateOrder(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("creates order on PAID status", async () => {
    const pendingPayment = { customerId: "u-1", status: "PENDING", cfOrderId: "GK-1" };
    mockPrisma.payment.findUnique.mockResolvedValue(pendingPayment);
    mockCashfree.PGFetchOrder.mockResolvedValue({ data: { order_status: "PAID" } });
    mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
    paymentService.createOrderFromPayment.mockResolvedValue({ id: "ord-new" });

    const req = { body: { cfOrderId: "GK-1" }, user: { userId: "u-1" } };
    const res = mockRes();
    await verifyPaymentAndCreateOrder(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, orderId: "ord-new" }));
  });
});

// ── getPaymentHistory ─────────────────────────────────────────────────────────
describe("getPaymentHistory", () => {
  it("returns enriched payment history", async () => {
    const payments = [
      { id: "pay-1", cfOrderId: "GK-1", amount: 43000, status: "SUCCESS", createdAt: new Date(), itemsSnapshot: JSON.stringify([]) },
    ];
    mockPrisma.payment.findMany.mockResolvedValue(payments);
    mockPrisma.order.findMany.mockResolvedValue([
      { id: "ord-1", cfOrderId: "GK-1", items: [], restaurant: { name: "Spice Garden" } },
    ]);

    const req = { user: { userId: "u-1" } };
    const res = mockRes();
    await getPaymentHistory(req, res, next);
    const json = res.json.mock.calls[0][0];
    expect(json.payments).toHaveLength(1);
    expect(json.payments[0].restaurantName).toBe("Spice Garden");
  });

  it("handles payments with no matching order", async () => {
    mockPrisma.payment.findMany.mockResolvedValue([
      { id: "pay-2", cfOrderId: "GK-2", amount: 10000, status: "PENDING", createdAt: new Date(), itemsSnapshot: null },
    ]);
    mockPrisma.order.findMany.mockResolvedValue([]);

    const req = { user: { userId: "u-1" } };
    const res = mockRes();
    await getPaymentHistory(req, res, next);
    const json = res.json.mock.calls[0][0];
    expect(json.payments[0].orderId).toBeNull();
  });

  it("handles new-format itemsSnapshot with orderItems field", async () => {
    const snapshot = JSON.stringify({ orderItems: [{ name: "Pizza" }], subtotal: 25000, deliveryFee: 3000, discount: 0, total: 28000 });
    mockPrisma.payment.findMany.mockResolvedValue([
      { id: "pay-3", cfOrderId: "GK-3", amount: 28000, status: "SUCCESS", createdAt: new Date(), itemsSnapshot: snapshot },
    ]);
    mockPrisma.order.findMany.mockResolvedValue([]);

    const req = { user: { userId: "u-1" } };
    const res = mockRes();
    await getPaymentHistory(req, res, next);
    expect(res.json).toHaveBeenCalled();
  });

  it("calls next on DB error", async () => {
    mockPrisma.payment.findMany.mockRejectedValue(new Error("DB error"));
    await getPaymentHistory({ user: { userId: "u-1" } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── retryPayment ──────────────────────────────────────────────────────────────
describe("retryPayment", () => {
  it("returns 400 when orderId is missing", async () => {
    const req = { params: {}, user: { userId: "u-1" } };
    const res = mockRes();
    await retryPayment(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("throws 404 when order not found", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    const req = { params: { orderId: "ghost" }, user: { userId: "u-1" } };
    const res = mockRes();
    await retryPayment(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it("throws 403 when customer does not own order", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ customerId: "other-user", status: "CANCELLED", total: 43000 });
    const req = { params: { orderId: "ord-1" }, user: { userId: "u-1" } };
    const res = mockRes();
    await retryPayment(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it("returns 400 when order is not CANCELLED", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ customerId: "u-1", status: "CONFIRMED", total: 43000 });
    const req = { params: { orderId: "ord-1" }, user: { userId: "u-1" } };
    const res = mockRes();
    await retryPayment(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("creates new payment session for CANCELLED order", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ customerId: "u-1", status: "CANCELLED", total: 43000 });
    paymentService.createPaymentSession.mockResolvedValue({ payment_session_id: "sess-retry" });
    const req = { params: { orderId: "ord-1" }, user: { userId: "u-1" } };
    const res = mockRes();
    await retryPayment(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
