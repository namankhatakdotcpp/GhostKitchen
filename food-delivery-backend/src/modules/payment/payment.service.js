import cashfree from "../../config/cashfree.js";
import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { env } from "../../config/env.js";

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

    // 6️⃣ RETURN SESSION DATA
    return {
      order_id: response.order_id,
      payment_session_id: response.payment_session_id,
      amount: response.order_amount,
      currency: response.order_currency,
    };
  } catch (error) {
    console.error("❌ Cashfree API Error:", error);
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
 * Updates order status based on payment status
 * 
 * 🔐 CRITICAL: This updates DB based on external source
 * 
 * @param {object} webhookData - Data from Cashfree
 * @returns {boolean} Success
 */
export const handlePaymentWebhook = async (webhookData) => {
  try {
    // 1️⃣ EXTRACT PAYMENT DATA FROM WEBHOOK
    const orderId = webhookData.order_id;
    const paymentStatus = webhookData.payment?.payment_status;

    console.log(
      `💳 Webhook received for order ${orderId}: ${paymentStatus}`
    );

    if (!orderId || !paymentStatus) {
      throw new AppError("Invalid webhook data", 400);
    }

    // 2️⃣ FETCH ORDER
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      console.warn(`⚠️ Webhook for non-existent order: ${orderId}`);
      return false;
    }

    // 3️⃣ UPDATE BASED ON PAYMENT STATUS
    if (paymentStatus === "SUCCESS") {
      // 🟢 PAYMENT SUCCESSFUL
      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: "SUCCESS",
          status: "CONFIRMED", // Auto-move to CONFIRMED
        },
      });

      console.log(`✅ Order ${orderId} payment confirmed`);
      return true;
    } else if (paymentStatus === "FAILED" || paymentStatus === "CANCELLED") {
      // 🔴 PAYMENT FAILED
      await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: "FAILED",
          status: "CANCELLED", // Auto-cancel if payment fails
        },
      });

      console.log(`❌ Order ${orderId} payment failed`);
      return true;
    } else {
      // ⚪ UNKNOWN STATUS
      console.warn(`⚠️ Unknown payment status: ${paymentStatus}`);
      return false;
    }
  } catch (error) {
    console.error("❌ Webhook processing error:", error);
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
    return response;
  } catch (error) {
    console.error("❌ Payment verification error:", error);
    throw new AppError("Failed to verify payment status", 500);
  }
};
