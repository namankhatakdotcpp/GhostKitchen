import cashfree from "../../config/cashfree.js";
import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { calculateOrderTotal } from "../orders/orders.service.js";
import { emitOrderNew } from "../../socket/socket.server.js";
import { createNotification } from "../notification/notification.service.js";

/**
 * Create the Order record for a successfully-paid Payment.
 * Idempotent: safe to call from both the webhook and /payments/verify —
 * the unique constraint on Order.cfOrderId guarantees a single order.
 */
export const createOrderFromPayment = async (payment) => {
  const existing = await prisma.order.findFirst({ where: { cfOrderId: payment.cfOrderId } });
  if (existing) return existing;

  // Preferred: the priced snapshot captured at payment-creation time, so menu
  // edits between payment and verification can never change what was charged.
  let snapshot = null;
  try {
    const parsed = JSON.parse(payment.itemsSnapshot);
    if (parsed && Array.isArray(parsed.orderItems)) snapshot = parsed;
  } catch { /* legacy format handled below */ }

  let orderItems, subtotal, deliveryFee, discount, total;
  if (snapshot) {
    ({ orderItems, subtotal, deliveryFee, discount, total } = snapshot);
  } else {
    // Legacy snapshot ([{menuItemId, quantity}]) — recalculate from the menu
    const items = JSON.parse(payment.itemsSnapshot);
    ({ orderItems, subtotal, deliveryFee, discount, total } = await calculateOrderTotal({
      restaurantId: payment.restaurantId,
      items,
      couponCode: payment.couponCode,
    }));
  }

  // Honor the admin autoConfirmOrders setting for paid orders too
  let initialStatus = "PLACED";
  try {
    const { getSiteConfigCached } = await import("../config/config.service.js");
    const cfg = await getSiteConfigCached();
    if (cfg?.autoConfirmOrders) initialStatus = "CONFIRMED";
  } catch { /* default to PLACED */ }

  let order;
  try {
    order = await prisma.order.create({
      data: {
        customerId: payment.customerId,
        restaurantId: payment.restaurantId,
        status: initialStatus,
        items: orderItems,
        subtotal,
        deliveryFee,
        discount,
        total,
        deliveryAddress: JSON.parse(payment.deliveryAddress),
        cfOrderId: payment.cfOrderId,
      },
      include: { restaurant: true },
    });
  } catch (err) {
    if (err.code === "P2002") {
      // Concurrent webhook + verify both tried to create — return the winner's order
      return prisma.order.findFirst({ where: { cfOrderId: payment.cfOrderId } });
    }
    throw err;
  }

  // Count the coupon redemption now that the money is actually captured.
  // (The payment flow intentionally claims usage at capture, not at intent.)
  if (payment.couponCode) {
    prisma.coupon.updateMany({
      where: { code: payment.couponCode.toUpperCase() },
      data: { usedCount: { increment: 1 } },
    }).catch(() => {});
  }

  emitOrderNew({ restaurantId: payment.restaurantId, order });

  createNotification({
    userId: payment.customerId,
    title: "Order placed!",
    body: "Your order is being prepared.",
    type: "ORDER_UPDATE",
    entityId: order.id,
  });
  if (order.restaurant?.ownerId) {
    createNotification({
      userId: order.restaurant.ownerId,
      title: "New order!",
      body: `Order #${order.id.slice(-6).toUpperCase()} received.`,
      type: "ORDER_UPDATE",
      entityId: order.id,
    });
  }

  return order;
};

/**
 * Payment Service - Cashfree Integration
 * 
 * Handles:
 * - Creating payment sessions from orders
 * - Verifying payment updates from webhooks
 * - Updating order status based on payment
 * 
 * Flow:
 * 1. Order created (status: PENDING, paymentStatus: PENDING)
 * 2. createPaymentSession() called with orderId
 * 3. Cashfree returns payment_session_id
 * 4. Frontend opens Cashfree UI with session_id
 * 5. User completes payment
 * 6. Cashfree sends webhook with payment status
 * 7. handleWebhook() updates order to SUCCESS/FAILED
 */

/**
 * CREATE PAYMENT SESSION
 * 
 * Called after order is created
 * Returns payment_session_id for frontend
 * 
 * @param {string} orderId - Order ID
 * @param {object} user - User object {id, email, phone}
 * @returns {object} Cashfree session data
 */
export const createPaymentSession = async (orderId, user) => {
  // auth middleware exposes userId; older callers passed id — accept both
  const requesterId = user.userId ?? user.id;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });

  if (!order) {
    logger.warn("Order not found for payment", { orderId, userId: requesterId });
    throw new AppError("Order not found", 404);
  }

  if (order.customerId !== requesterId) {
    logger.error("Unauthorized payment session attempt", {
      orderId,
      requestedBy: requesterId,
      orderBelongsTo: order.customerId,
    });
    throw new AppError("Unauthorized to create payment for this order", 403);
  }

  const request = {
    order_id: orderId,
    order_amount: (order.total / 100).toFixed(2), // paise → rupees
    order_currency: "INR",
    customer_details: {
      customer_id: requesterId,
      customer_email: order.customer?.email || "noemail@example.com",
      customer_phone: order.customer?.phone || "9999999999",
    },
    order_meta: {
      return_url: `${env.FRONTEND_URL || "http://localhost:3000"}/payment-success?order_id=${orderId}`,
      notify_url: `${env.BACKEND_URL || "http://localhost:5000"}/api/payments/webhook`,
    },
    order_note: `Order #${orderId.slice(0, 8).toUpperCase()}`,
  };

  try {
    const response = await cashfree.PGCreateOrder(request);

    logger.info("Payment session created", {
      orderId,
      userId: user.id,
      amount: order.total,
      paymentSessionId: response.payment_session_id,
    });

    return {
      order_id: response.order_id,
      payment_session_id: response.payment_session_id,
      amount: response.order_amount,
      currency: response.order_currency,
    };
  } catch (error) {
    logger.error("Cashfree API error creating payment session", {
      orderId,
      userId: user.id,
      amount: order.total,
      errorMessage: error.message,
    });
    throw new AppError("Failed to create payment session. Please try again.", 500);
  }
};

/**
 * HANDLE WEBHOOK (FROM CASHFREE)
 * 
 * Called by Cashfree when payment is completed
 * Uses idempotency check to prevent duplicate processing
 * Updates order status based on payment status
 * 
 * 🔐 CRITICAL: This updates DB based on external source
 * ✅ IDEMPOTENT: Multiple webhooks are safe (duplicates ignored)
 * 
 * @param {object} webhookData - Data from Cashfree
 * @returns {boolean} Success
 */
export const handlePaymentWebhook = async (webhookData) => {
  try {
    // Cashfree webhook payload (2023+ schema): data.order.order_id, data.payment.payment_status
    // Older/test payloads may carry these at the top level — accept both.
    const data = webhookData.data ?? webhookData;
    const cfOrderId = data.order?.order_id ?? data.order_id;
    const paymentStatus = data.payment?.payment_status ?? webhookData.payment?.payment_status;
    const cfPaymentId = data.payment?.cf_payment_id ?? webhookData.cf_payment_id;
    const webhookAmount = data.order?.order_amount ?? data.order_amount; // rupees

    const eventId = cfPaymentId
      ? `${cfPaymentId}_${paymentStatus}`
      : `${cfOrderId}_${paymentStatus}`;

    logger.info("Webhook received from Cashfree", { cfOrderId, eventId, paymentStatus, cfPaymentId });

    if (!cfOrderId || !paymentStatus) {
      logger.warn("Invalid webhook data received", { webhookKeys: Object.keys(webhookData) });
      throw new AppError("Invalid webhook data", 400);
    }

    let becameSuccess = false;
    await prisma.$transaction(async (tx) => {
      // Idempotency: record each event exactly once
      const existingWebhook = await tx.paymentWebhook.findUnique({ where: { eventId } });
      if (existingWebhook) {
        logger.info("Duplicate webhook ignored", { cfOrderId, eventId });
        return;
      }
      await tx.paymentWebhook.create({ data: { eventId } });

      // The webhook's order_id is OUR cfOrderId — orders are created later by
      // /payments/verify, so the source of truth here is the Payment record.
      const payment = await tx.payment.findUnique({ where: { cfOrderId } });
      if (!payment) {
        logger.warn("Webhook for unknown payment", { cfOrderId, eventId });
        return;
      }

      // Amount check: Cashfree reports rupees, Payment.amount is paise
      if (webhookAmount && Math.abs(Math.round(Number(webhookAmount) * 100) - payment.amount) > 1) {
        logger.error("CRITICAL: webhook amount mismatch — payment NOT updated", {
          cfOrderId, expectedPaise: payment.amount, receivedRupees: webhookAmount, cfPaymentId,
        });
        return;
      }

      if (paymentStatus === "SUCCESS") {
        await tx.payment.updateMany({
          where: { cfOrderId, status: "PENDING" },
          data: { status: "SUCCESS", cfPaymentId: cfPaymentId ? String(cfPaymentId) : undefined },
        });
        becameSuccess = true;
        logger.info("Payment marked SUCCESS via webhook", { cfOrderId, cfPaymentId });
      } else if (["FAILED", "CANCELLED", "USER_DROPPED", "VOID"].includes(paymentStatus)) {
        await tx.payment.updateMany({
          where: { cfOrderId, status: "PENDING" },
          data: { status: "FAILED" },
        });
        logger.warn("Payment marked FAILED via webhook", { cfOrderId, paymentStatus });
      } else {
        logger.warn("Unknown payment status in webhook", { cfOrderId, paymentStatus });
      }
    });

    // Create the order even if the customer never returns to the app
    // (closed browser after paying). Idempotent with /payments/verify.
    if (becameSuccess) {
      const payment = await prisma.payment.findUnique({ where: { cfOrderId } });
      if (payment) {
        await createOrderFromPayment(payment).catch((err) =>
          logger.error("Order creation from webhook failed", { cfOrderId, error: err.message })
        );
      }
    }

    return true;
  } catch (error) {
    logger.error("Payment webhook processing failed", {
      cfOrderId: webhookData?.data?.order?.order_id ?? webhookData?.order_id,
      errorMessage: error.message,
    });
    throw error;
  }
};

/**
 * VERIFY PAYMENT STATUS (OPTIONAL)
 * 
 * Manually check payment status with Cashfree
 * Useful for reconciliation
 * 
 * @param {string} orderId - Order ID
 * @returns {object} Payment status from Cashfree
 */
export const verifyPaymentStatus = async (orderId) => {
  try {
    const response = await cashfree.PGOrderFetchPayments(orderId);
    logger.info("Payment status verified with Cashfree", {
      orderId,
      status: response.payment_status,
      cfPaymentId: response.cf_payment_id,
      timestamp: new Date(),
    });
    return response;
  } catch (error) {
    logger.error("Payment verification failed", {
      orderId,
      errorMessage: error.message,
      timestamp: new Date(),
    });
    throw new AppError("Failed to verify payment status", 500);
  }
};
