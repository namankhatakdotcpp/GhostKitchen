import cashfree from "../../config/cashfree.js";
import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

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
  // 1️⃣ FETCH ORDER WITH DETAILS
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: true,
      orderItems: true,
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  // 2️⃣ VERIFY ORDER BELONGS TO USER
  if (order.userId !== user.id) {
    throw new AppError("Unauthorized to create payment for this order", 403);
  }

  // 3️⃣ VALIDATE ORDER STATUS
  if (order.paymentStatus !== "PENDING") {
    throw new AppError(
      `Cannot create payment for order with status ${order.paymentStatus}`,
      400
    );
  }

  // 4️⃣ CREATE CASHFREE ORDER REQUEST
  const request = {
    order_id: orderId,
    order_amount: order.totalAmount,
    order_currency: "INR",
    customer_details: {
      customer_id: user.id,
      customer_email: user.email || "noemail@example.com",
      customer_phone: user.phone || "9999999999",
    },
    order_meta: {
      return_url: `${env.FRONTEND_URL || "http://localhost:3000"}/payment-success?order_id=${orderId}`,
      notify_url: `${env.BACKEND_URL || "http://localhost:5000"}/api/payments/webhook`,
    },
    order_note: `Order #${orderId.slice(0, 8).toUpperCase()}`,
  };

  // 5️⃣ CREATE SESSION WITH CASHFREE
  try {
    const response = await cashfree.PGCreateOrder(request);

    logger.info("Payment session created", {
      orderId,
      paymentSessionId: response.payment_session_id,
    });

    // 6️⃣ RETURN SESSION DATA
    return {
      order_id: response.order_id,
      payment_session_id: response.payment_session_id,
      amount: response.order_amount,
      currency: response.order_currency,
    };
  } catch (error) {
    logger.error("Cashfree API Error", {
      orderId,
      error: error.message,
    });
    throw new AppError(
      "Failed to create payment session. Please try again.",
      500
    );
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
    // 1️⃣ EXTRACT PAYMENT DATA FROM WEBHOOK
    const orderId = webhookData.order_id;
    const paymentStatus = webhookData.payment?.payment_status;
    // 🔑 IDEMPOTENCY KEY: Include status to distinguish different payment states
    const eventId = `${webhookData.cf_payment_id}_${paymentStatus}` || webhookData.order_id;

    logger.info("Webhook received", {
      orderId,
      eventId,
      paymentStatus,
    });

    if (!orderId || !paymentStatus) {
      logger.warn("Invalid webhook data", { webhookData });
      throw new AppError("Invalid webhook data", 400);
    }

    // 2️⃣ CHECK FOR DUPLICATE WEBHOOK (IDEMPOTENCY)
    const existingWebhook = await prisma.paymentWebhook.findUnique({
      where: { eventId },
    });

    if (existingWebhook) {
      logger.info("Duplicate webhook ignored", {
        orderId,
        eventId,
        previousCreatedAt: existingWebhook.createdAt,
      });
      return true; // Return success but don't reprocess
    }

    // 3️⃣ ATOMIC TRANSACTION - Record webhook + Update order
    await prisma.$transaction(async (tx) => {
      // Record the webhook to prevent duplicates
      await tx.paymentWebhook.create({
        data: { eventId },
      });

      // 4️⃣ FETCH ORDER
      const order = await tx.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        logger.warn("Webhook for non-existent order", { orderId, eventId });
        return;
      }

      // 5️⃣ UPDATE BASED ON PAYMENT STATUS
      if (paymentStatus === "SUCCESS") {
        // 🟢 PAYMENT SUCCESSFUL
        await tx.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: "SUCCESS",
            status: "CONFIRMED", // Auto-move to CONFIRMED
          },
        });

        logger.info("Order payment confirmed", {
          orderId,
          newStatus: "CONFIRMED",
        });
      } else if (paymentStatus === "FAILED" || paymentStatus === "CANCELLED") {
        // 🔴 PAYMENT FAILED
        await tx.order.update({
          where: { id: orderId },
          data: {
            paymentStatus: "FAILED",
            status: "CANCELLED", // Auto-cancel if payment fails
          },
        });

        logger.warn("Order payment failed", {
          orderId,
          paymentStatus,
        });
      } else {
        // ⚪ UNKNOWN STATUS
        logger.warn("Unknown payment status", {
          orderId,
          paymentStatus,
        });
      }
    });

    return true;
  } catch (error) {
    logger.error("Webhook processing error", {
      error: error.message,
      webhookData: JSON.stringify(webhookData).substring(0, 100),
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
    logger.info("Payment status verified", {
      orderId,
      status: response.payment_status,
    });
    return response;
  } catch (error) {
    logger.error("Payment verification error", {
      orderId,
      error: error.message,
    });
    throw new AppError("Failed to verify payment status", 500);
  }
};
