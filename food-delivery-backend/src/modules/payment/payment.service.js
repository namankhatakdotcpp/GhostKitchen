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
    logger.warn("Order not found for payment", { orderId, userId: user.id });
    throw new AppError("Order not found", 404);
  }

  // 2️⃣ VERIFY ORDER BELONGS TO USER
  if (order.userId !== user.id) {
    logger.error("Unauthorized payment session attempt", {
      orderId,
      requestedBy: user.id,
      orderBelongsTo: order.userId,
    });
    throw new AppError("Unauthorized to create payment for this order", 403);
  }

  // 3️⃣ VALIDATE ORDER STATUS
  if (order.paymentStatus !== "PENDING") {
    logger.warn("Cannot create payment for non-pending order", {
      orderId,
      currentPaymentStatus: order.paymentStatus,
      userId: user.id,
    });
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
      userId: user.id,
      amount: order.totalAmount,
      paymentSessionId: response.payment_session_id,
      itemCount: order.orderItems.length,
    });

    // 6️⃣ RETURN SESSION DATA
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
      amount: order.totalAmount,
      errorMessage: error.message,
      errorCode: error.code,
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
    const cfPaymentId = webhookData.cf_payment_id;
    // 🔑 IDEMPOTENCY KEY: Include status to distinguish different payment states
    const eventId = `${cfPaymentId}_${paymentStatus}` || webhookData.order_id;

    logger.info("Webhook received from Cashfree", {
      orderId,
      eventId,
      paymentStatus,
      cfPaymentId,
      timestamp: webhookData.payment?.payment_time,
    });

    if (!orderId || !paymentStatus) {
      logger.warn("Invalid webhook data received", {
        missingOrderId: !orderId,
        missingPaymentStatus: !paymentStatus,
        webhookKeys: Object.keys(webhookData),
      });
      throw new AppError("Invalid webhook data", 400);
    }

    // 2️⃣ & 3️⃣ ATOMIC TRANSACTION - Check idempotency + Record webhook + Update order
    // ⚠️ Idempotency check moved INSIDE transaction for row-level locking
    await prisma.$transaction(async (tx) => {
      // Check for duplicate webhook (with transaction locking)
      const existingWebhook = await tx.paymentWebhook.findUnique({
        where: { eventId },
      });

      if (existingWebhook) {
        logger.info("Duplicate webhook detected and ignored", {
          orderId,
          eventId,
          paymentStatus,
          firstSeenAt: existingWebhook.createdAt,
          duplicateDeliveredAt: new Date(),
        });
        return; // Exit transaction, no duplicate processing
      }

      // Record the webhook to prevent duplicates
      await tx.paymentWebhook.create({
        data: { eventId },
      });

      // 4️⃣ FETCH ORDER
      const order = await tx.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        logger.warn("Webhook received for non-existent order", {
          orderId,
          eventId,
          paymentStatus,
          cfPaymentId,
        });
        return;
      }

      // 5️⃣ UPDATE BASED ON PAYMENT STATUS (CONDITIONAL)
      // ⚠️ Only update if payment status is still PENDING to prevent override
      if (paymentStatus === "SUCCESS") {
        // 🟢 PAYMENT SUCCESSFUL
        // Only update if still PENDING (prevent override of later status changes)
        const updated = await tx.order.updateMany({
          where: {
            id: orderId,
            paymentStatus: "PENDING", // Only update if still PENDING
          },
          data: {
            paymentStatus: "SUCCESS",
            status: "CONFIRMED", // Auto-move to CONFIRMED
          },
        });

        if (updated.count > 0) {
          logger.info("Order payment confirmed successfully", {
            orderId,
            userId: order.userId,
            amount: order.totalAmount,
            previousStatus: order.paymentStatus,
            newPaymentStatus: "SUCCESS",
            newOrderStatus: "CONFIRMED",
            cfPaymentId,
          });
        } else {
          logger.warn("Order payment status already changed (race condition detected)", {
            orderId,
            userId: order.userId,
            incomingPaymentStatus: paymentStatus,
            currentPaymentStatus: order.paymentStatus,
            cfPaymentId,
          });
        }
      } else if (paymentStatus === "FAILED" || paymentStatus === "CANCELLED") {
        // 🔴 PAYMENT FAILED
        // Only update if still PENDING
        const updated = await tx.order.updateMany({
          where: {
            id: orderId,
            paymentStatus: "PENDING", // Only update if still PENDING
          },
          data: {
            paymentStatus: "FAILED",
            status: "CANCELLED", // Auto-cancel if payment fails
          },
        });

        if (updated.count > 0) {
          logger.warn("Order payment failed, auto-cancelled", {
            orderId,
            userId: order.userId,
            amount: order.totalAmount,
            paymentStatus,
            newStatus: "CANCELLED",
            cfPaymentId,
          });
        } else {
          logger.warn("Order payment failed but already processed", {
            orderId,
            userId: order.userId,
            incomingPaymentStatus: paymentStatus,
            currentPaymentStatus: order.paymentStatus,
            cfPaymentId,
          });
        }
      } else {
        // ⚪ UNKNOWN STATUS
        logger.warn("Unknown payment status received", {
          orderId,
          userId: order.userId,
          paymentStatus,
          cfPaymentId,
          validStatuses: ["SUCCESS", "FAILED", "CANCELLED"],
        });
      }
    });

    return true;
  } catch (error) {
    logger.error("Payment webhook processing failed", {
      orderId: webhookData?.order_id,
      cfPaymentId: webhookData?.cf_payment_id,
      paymentStatus: webhookData?.payment?.payment_status,
      errorMessage: error.message,
      errorStack: error.stack?.substring(0, 200),
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
