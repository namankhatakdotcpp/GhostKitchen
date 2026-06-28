import { prisma } from "../../config/prisma.js";
import cashfree from "../../config/cashfree.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

// Prefix to distinguish rider COD payments from customer order payments in the webhook
export const COD_ORDER_PREFIX = "codsettl-";

/**
 * Returns the rider's pending COD dues — unsettled settlements grouped
 * into a summary + order list.
 */
export async function getRiderCODDues(riderId) {
  const rows = await prisma.cODSettlement.findMany({
    where: { riderId, riderSettledAt: null },
    include: { order: { select: { id: true, placedAt: true, total: true } } },
    orderBy: { createdAt: "asc" },
  });

  const totalDuePaise = rows.reduce((s, r) => s + r.riderCODDue, 0);

  return {
    totalDuePaise,
    orderCount: rows.length,
    orders: rows.map((r) => ({
      settlementId: r.id,
      orderId: r.orderId,
      orderDate: r.createdAt,
      customerTotal: r.customerTotal,
      riderPayout: r.riderPayout,
      riderCODDue: r.riderCODDue,
    })),
  };
}

/**
 * Returns all-time COD payment history for a rider.
 */
export async function getRiderCODPaymentHistory(riderId) {
  const rows = await prisma.riderCODPayment.findMany({
    where: { riderId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return rows;
}

/**
 * Initiates a Cashfree payment for the rider to pay their total pending dues
 * back to the platform. Returns a Cashfree payment session.
 *
 * Idempotent: if there's already a PENDING payment for this rider within the
 * last 30 minutes, returns that session (avoids duplicate payments).
 */
export async function initiateRiderCODPayment(riderId, riderUser) {
  const dues = await getRiderCODDues(riderId);
  if (dues.totalDuePaise <= 0) {
    throw new Error("No pending COD dues to pay");
  }

  // Idempotency: reuse a recent PENDING payment if it exists
  const recent = await prisma.riderCODPayment.findFirst({
    where: {
      riderId,
      status: "PENDING",
      createdAt: { gte: new Date(Date.now() - 30 * 60_000) },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    // Re-fetch the Cashfree session for this existing order
    try {
      const response = await cashfree.PGFetchOrder(recent.cfOrderId);
      const payload = response.data ?? response;
      return {
        cfOrderId: recent.cfOrderId,
        paymentSessionId: payload.payment_session_id,
        amountPaise: recent.amountPaise,
        isReused: true,
      };
    } catch {
      // Session may have expired — fall through to create a new one
    }
  }

  const cfOrderId = `${COD_ORDER_PREFIX}${riderId.slice(0, 8)}-${Date.now()}`;
  const amountRupees = (dues.totalDuePaise / 100).toFixed(2);

  const request = {
    order_id: cfOrderId,
    order_amount: amountRupees,
    order_currency: "INR",
    customer_details: {
      customer_id: riderId,
      customer_email: riderUser.email || "rider@ghostkitchen.app",
      customer_phone: riderUser.phone || "9999999999",
    },
    order_meta: {
      return_url: `${env.FRONTEND_URL || "http://localhost:3000"}/delivery/cod-dues?status=done&ref=${cfOrderId}`,
      notify_url: `${env.BACKEND_URL || "http://localhost:5000"}/api/payments/webhook`,
    },
    order_note: `COD settlement — rider ${riderId.slice(0, 8)}`,
  };

  const response = await cashfree.PGCreateOrder(request);
  const payload = response.data ?? response;

  await prisma.riderCODPayment.create({
    data: {
      riderId,
      cfOrderId,
      amountPaise: dues.totalDuePaise,
      status: "PENDING",
    },
  });

  logger.info("Rider COD payment initiated", { riderId, cfOrderId, amountPaise: dues.totalDuePaise });

  return {
    cfOrderId,
    paymentSessionId: payload.payment_session_id,
    amountPaise: dues.totalDuePaise,
    isReused: false,
  };
}

/**
 * Called from the webhook handler when a codsettl- prefixed order succeeds.
 * Marks all pending settlements for the rider as settled.
 */
export async function handleRiderCODPaymentSuccess(cfOrderId, cfPaymentId, paidAmountRupees) {
  const payment = await prisma.riderCODPayment.findUnique({ where: { cfOrderId } });
  if (!payment) {
    logger.warn("RiderCODPayment not found for cfOrderId", { cfOrderId });
    return;
  }
  if (payment.status === "SUCCESS") {
    logger.info("RiderCODPayment already marked SUCCESS (duplicate webhook)", { cfOrderId });
    return;
  }

  const paidPaise = Math.round(Number(paidAmountRupees) * 100);
  if (Math.abs(paidPaise - payment.amountPaise) > 5) {
    logger.error("CRITICAL: COD payment amount mismatch", { cfOrderId, expectedPaise: payment.amountPaise, paidPaise });
    return;
  }

  const now = new Date();
  const settled = await prisma.cODSettlement.updateMany({
    where: { riderId: payment.riderId, riderSettledAt: null },
    data: { riderSettledAt: now, riderSettledBy: `rider-cashfree:${cfOrderId}` },
  });

  await prisma.riderCODPayment.update({
    where: { cfOrderId },
    data: { status: "SUCCESS", cfPaymentId: cfPaymentId ? String(cfPaymentId) : undefined, settledCount: settled.count },
  });

  logger.info("Rider COD payment settled", { cfOrderId, riderId: payment.riderId, settledOrders: settled.count });
}

/**
 * Manual verify: rider can call this after returning from Cashfree to check
 * status (in case the webhook is slow). Directly polls Cashfree and processes.
 */
export async function verifyRiderCODPayment(cfOrderId) {
  const payment = await prisma.riderCODPayment.findUnique({ where: { cfOrderId } });
  if (!payment) throw new Error("Payment record not found");
  if (payment.status === "SUCCESS") return { status: "SUCCESS", settledCount: payment.settledCount };

  let payments;
  try {
    const resp = await cashfree.PGOrderFetchPayments(cfOrderId);
    payments = resp.data ?? resp;
  } catch (err) {
    throw new Error("Could not verify payment with Cashfree: " + err.message);
  }

  const successPay = (Array.isArray(payments) ? payments : [payments])
    .find((p) => p.payment_status === "SUCCESS");

  if (successPay) {
    await handleRiderCODPaymentSuccess(
      cfOrderId,
      successPay.cf_payment_id,
      successPay.order_amount ?? (payment.amountPaise / 100).toFixed(2),
    );
    return { status: "SUCCESS" };
  }

  return { status: payment.status };
}

/**
 * Returns pending COD payables that the platform owes a restaurant.
 */
export async function getRestaurantCODDues(restaurantId) {
  const rows = await prisma.cODSettlement.findMany({
    where: { restaurantId, restaurantPaidAt: null },
    include: { order: { select: { id: true, placedAt: true } } },
    orderBy: { createdAt: "asc" },
  });

  const totalPayablePaise = rows.reduce((s, r) => s + r.restaurantPayable, 0);

  return {
    totalPayablePaise,
    orderCount: rows.length,
    orders: rows.map((r) => ({
      settlementId: r.id,
      orderId: r.orderId,
      orderDate: r.createdAt,
      restaurantPayable: r.restaurantPayable,
      gstCollected: r.gstCollected,
      adminNet: r.adminNet,
    })),
  };
}
