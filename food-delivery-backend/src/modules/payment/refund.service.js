import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { logger } from "../../utils/logger.js";
import { env } from "../../config/env.js";
import cashfree from "../../config/cashfree.js";
import { auditLog } from "../../utils/audit.js";
import { createNotification } from "../notification/notification.service.js";

/**
 * Initiate a Cashfree refund for a paid order.
 * Idempotent: if a refund for this cfOrderId already exists and succeeded, returns it.
 */
export const initiateRefund = async ({ cfOrderId, amount, reason, adminId, req }) => {
  // 1. Verify there is a successful payment to refund
  const payment = await prisma.payment.findUnique({ where: { cfOrderId } });
  if (!payment) throw new AppError("Payment record not found", 404);
  if (payment.status !== "SUCCESS") throw new AppError("Can only refund successful payments", 400);

  const refundAmount = amount ?? payment.amount;
  if (refundAmount > payment.amount) throw new AppError("Refund amount cannot exceed payment amount", 400);
  if (refundAmount <= 0) throw new AppError("Refund amount must be positive", 400);

  // 2. Check for duplicate — block if already succeeded OR still processing
  const existing = await prisma.refund.findFirst({
    where: { cfOrderId, status: { in: ["SUCCESS", "PENDING"] } },
  });
  if (existing?.status === "SUCCESS") return existing;
  if (existing?.status === "PENDING") {
    throw new AppError("A refund is already pending for this order. Wait for it to settle before initiating another.", 409);
  }

  // 3. Call Cashfree Refund API
  const cfRefundId = `REF-${cfOrderId}-${Date.now()}`;
  let cfResponse = null;

  try {
    cfResponse = await cashfree.PGOrderCreateRefund("2023-08-01", cfOrderId, {
      refund_amount: (refundAmount / 100).toFixed(2),
      refund_id: cfRefundId,
      refund_note: reason || "Refund initiated by admin",
    });
    logger.info("Cashfree refund initiated", { cfOrderId, cfRefundId, amount: refundAmount });
  } catch (cfErr) {
    logger.error("Cashfree refund API failed", { cfOrderId, error: cfErr.message });
    throw new AppError(`Payment gateway error: ${cfErr.message}`, 502);
  }

  const refund = await prisma.refund.create({
    data: {
      cfOrderId,
      cfRefundId: cfResponse?.data?.refund_id ?? cfRefundId,
      amount: refundAmount,
      status: cfResponse?.data?.refund_status === "SUCCESS" ? "SUCCESS" : "PENDING",
      reason: reason || null,
      initiatedBy: adminId,
    },
  });

  // Notify customer
  const order = await prisma.order.findFirst({ where: { cfOrderId }, select: { customerId: true, id: true } });
  if (order) {
    createNotification({
      userId: order.customerId,
      title: "Refund initiated",
      body: `₹${(refundAmount / 100).toFixed(0)} will be credited to your account in 5–7 business days.`,
      type: "REFUND",
      entityId: order.id,
    }).catch(() => {});
  }

  await auditLog({
    userId: adminId,
    action: "REFUND_INITIATED",
    entityType: "Payment",
    entityId: cfOrderId,
    meta: { amount: refundAmount, reason, cfRefundId: refund.cfRefundId },
    req,
  });

  return refund;
};

/**
 * Get all refunds, optionally filtered by cfOrderId.
 */
export const getRefunds = async ({ cfOrderId, page = 1, limit = 50 } = {}) => {
  const where = cfOrderId ? { cfOrderId } : {};
  const skip = (page - 1) * Math.min(limit, 100);
  const [refunds, total] = await prisma.$transaction([
    prisma.refund.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit }),
    prisma.refund.count({ where }),
  ]);
  return { refunds, total, page, pages: Math.ceil(total / limit) };
};

/**
 * Sync refund status from Cashfree (called by webhook or manually).
 */
export const syncRefundStatus = async (cfRefundId) => {
  const refund = await prisma.refund.findUnique({ where: { cfRefundId } });
  if (!refund) throw new AppError("Refund not found", 404);

  try {
    const response = await cashfree.PGOrderFetchRefund("2023-08-01", refund.cfOrderId, cfRefundId);
    const status = response?.data?.refund_status;
    if (status && status !== refund.status) {
      await prisma.refund.update({ where: { cfRefundId }, data: { status } });
      logger.info("Refund status synced", { cfRefundId, oldStatus: refund.status, newStatus: status });
    }
    return { ...refund, status: status ?? refund.status };
  } catch (err) {
    logger.error("Refund status sync failed", { cfRefundId, error: err.message });
    throw new AppError("Failed to sync refund status from gateway", 502);
  }
};
