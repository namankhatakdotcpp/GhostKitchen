import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../config/prisma.js", () => ({
  prisma: {
    payment: { findUnique: vi.fn() },
    refund: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), update: vi.fn() },
    order: { findFirst: vi.fn() },
    notification: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

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
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../config/cashfree.js", () => ({
  default: {
    PGOrderCreateRefund: vi.fn().mockResolvedValue({
      data: { refund_id: "cf-refund-1", refund_status: "PENDING" },
    }),
  },
}));

vi.mock("../utils/audit.js", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../modules/notification/notification.service.js", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
const { initiateRefund, getRefunds, syncRefundStatus } = await import("../modules/payment/refund.service.js");
const { prisma } = await import("../config/prisma.js");

// ── Test data ─────────────────────────────────────────────────────────────────

const PAYMENT = {
  id: "pay-1",
  cfOrderId: "cf-order-1",
  amount: 50000,
  status: "SUCCESS",
};

const REFUND = {
  id: "ref-1",
  cfOrderId: "cf-order-1",
  cfRefundId: "cf-refund-1",
  amount: 50000,
  status: "SUCCESS",
  reason: "Test refund",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("initiateRefund", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.payment.findUnique.mockResolvedValue(PAYMENT);
    prisma.refund.findFirst.mockResolvedValue(null);
    prisma.refund.create.mockResolvedValue(REFUND);
    prisma.order.findFirst.mockResolvedValue({ customerId: "cust-1", id: "order-1" });
  });

  it("creates a refund for a valid paid order", async () => {
    const result = await initiateRefund({
      cfOrderId: "cf-order-1",
      amount: 50000,
      reason: "Customer request",
      adminId: "admin-1",
    });
    expect(result.id).toBe("ref-1");
    expect(prisma.refund.create).toHaveBeenCalledOnce();
  });

  it("returns existing refund idempotently if already succeeded", async () => {
    prisma.refund.findFirst.mockResolvedValue({ ...REFUND, status: "SUCCESS" });

    const result = await initiateRefund({
      cfOrderId: "cf-order-1",
      amount: 50000,
      reason: "Duplicate",
      adminId: "admin-1",
    });

    expect(result.status).toBe("SUCCESS");
    expect(prisma.refund.create).not.toHaveBeenCalled();
  });

  it("throws 409 when a PENDING refund already exists", async () => {
    prisma.refund.findFirst.mockResolvedValue({ ...REFUND, status: "PENDING" });

    await expect(
      initiateRefund({ cfOrderId: "cf-order-1", amount: 50000, adminId: "admin-1" })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 404 when no payment record exists", async () => {
    prisma.payment.findUnique.mockResolvedValue(null);

    await expect(
      initiateRefund({ cfOrderId: "cf-order-missing", amount: 1000, adminId: "admin-1" })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 400 when payment is not in SUCCESS status", async () => {
    prisma.payment.findUnique.mockResolvedValue({ ...PAYMENT, status: "PENDING" });

    await expect(
      initiateRefund({ cfOrderId: "cf-order-1", amount: 1000, adminId: "admin-1" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when refund amount exceeds payment amount", async () => {
    await expect(
      initiateRefund({ cfOrderId: "cf-order-1", amount: 999999, adminId: "admin-1" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 for zero or negative refund amount", async () => {
    await expect(
      initiateRefund({ cfOrderId: "cf-order-1", amount: 0, adminId: "admin-1" })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("uses full payment amount when amount is not provided", async () => {
    await initiateRefund({ cfOrderId: "cf-order-1", adminId: "admin-1" });
    const createCall = prisma.refund.create.mock.calls[0][0].data;
    expect(createCall.amount).toBe(50000);
  });

  it("skips notification when no matching order found", async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    const result = await initiateRefund({ cfOrderId: "cf-order-1", amount: 50000, adminId: "admin-1" });
    expect(result.id).toBe("ref-1");
  });
});

// ── getRefunds ────────────────────────────────────────────────────────────────
describe("getRefunds", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated refunds without filter", async () => {
    const refunds = [{ id: "ref-1", cfOrderId: "GK-1", status: "SUCCESS", amount: 43000 }];
    prisma.$transaction.mockResolvedValue([refunds, 1]);

    const result = await getRefunds({ page: 1, limit: 50 });
    expect(result.refunds).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.pages).toBe(1);
  });

  it("filters by cfOrderId when provided", async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    const result = await getRefunds({ cfOrderId: "GK-1", page: 1, limit: 10 });
    expect(result.total).toBe(0);
    expect(result.pages).toBe(0);
  });

  it("uses defaults when called with no arguments", async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);
    const result = await getRefunds();
    expect(result).toMatchObject({ refunds: [], total: 0, page: 1 });
  });

  it("computes pages correctly for partial page", async () => {
    prisma.$transaction.mockResolvedValue([[], 3]);
    const result = await getRefunds({ limit: 2 });
    expect(result.pages).toBe(2); // Math.ceil(3/2)
  });
});

// ── syncRefundStatus ──────────────────────────────────────────────────────────
describe("syncRefundStatus", () => {
  const existingRefund = { cfRefundId: "REF-1", cfOrderId: "GK-1", status: "PENDING" };

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.refund.findUnique.mockResolvedValue(existingRefund);
  });

  it("throws 404 when refund not found", async () => {
    prisma.refund.findUnique.mockResolvedValue(null);
    await expect(syncRefundStatus("REF-ghost")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("updates status when Cashfree reports a different status", async () => {
    const { default: cashfree } = await import("../config/cashfree.js");
    cashfree.PGFetchRefund = vi.fn().mockResolvedValue({ data: { refund_status: "SUCCESS" } });
    prisma.refund.update.mockResolvedValue({ ...existingRefund, status: "SUCCESS" });

    const result = await syncRefundStatus("REF-1");
    expect(result.status).toBe("SUCCESS");
    expect(prisma.refund.update).toHaveBeenCalledOnce();
  });

  it("does not update when status is unchanged", async () => {
    const { default: cashfree } = await import("../config/cashfree.js");
    cashfree.PGFetchRefund = vi.fn().mockResolvedValue({ data: { refund_status: "PENDING" } });

    const result = await syncRefundStatus("REF-1");
    expect(result.status).toBe("PENDING");
    expect(prisma.refund.update).not.toHaveBeenCalled();
  });

  it("throws 502 when Cashfree fetch fails", async () => {
    const { default: cashfree } = await import("../config/cashfree.js");
    cashfree.PGFetchRefund = vi.fn().mockRejectedValue(new Error("CF network error"));
    await expect(syncRefundStatus("REF-1")).rejects.toMatchObject({ statusCode: 502 });
  });
});
