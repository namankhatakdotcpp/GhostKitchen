import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../config/prisma.js", () => ({
  prisma: {
    payment: { findUnique: vi.fn() },
    refund: { findFirst: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
    order: { findFirst: vi.fn() },
    notification: { create: vi.fn() },
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

vi.mock("../notification/notification.service.js", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

// ── Import after mocks ────────────────────────────────────────────────────────
const { initiateRefund } = await import("../modules/payment/refund.service.js");
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
});
