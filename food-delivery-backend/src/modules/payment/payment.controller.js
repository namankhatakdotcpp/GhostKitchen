import * as paymentService from "./payment.service.js";
import { verifyCashfreeSignature } from "../../utils/cashfree.js";
import { logger } from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";

/**
 * Payment Controller - HTTP Handlers
 * 
 * Routes:
 * - POST /api/payments/create-session → Create payment for order
 * - POST /api/payments/webhook → Receive webhook from Cashfree
 * - GET /api/payments/verify/:orderId → Check payment status
 */

/**
 * POST /api/payments/create-session
 * Create payment session for order
 * 
 * Request:
 * {
 *   "orderId": "order-uuid"
 * }
 * 
 * Response:
 * {
 *   "order_id": "order-uuid",
 *   "payment_session_id": "session-id",
 *   "amount": 599.99,
 *   "currency": "INR"
 * }
 */
export const createSession = async (req, res, next) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const session = await paymentService.createPaymentSession(
      orderId,
      req.user
    );

    res.json({
      success: true,
      message: "Payment session created",
      data: session,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/webhook
 * Receive payment status updates from Cashfree
 * 
 * 🔐 CRITICAL: Verifies webhook signature from Cashfree
 * This prevents spoofed payment confirmations
 * 
 * 🔐 NOTE: This endpoint should NOT require authentication
 * It's called by Cashfree servers, not your frontend
 */
export const webhook = async (req, res, next) => {
  try {
    // 1️⃣ VERIFY SIGNATURE (CRITICAL SECURITY CHECK)
    const signature = req.headers["x-webhook-signature"];
    const rawBody = req.rawBody || req.body; // Use stored raw body for signature verification

    if (!signature) {
      logger.warn("Webhook missing signature header");
      return res.status(401).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    // Convert raw body to string if it's a Buffer
    let rawBodyString = rawBody;
    if (Buffer.isBuffer(rawBody)) {
      rawBodyString = rawBody.toString();
    } else if (typeof rawBody !== "string") {
      rawBodyString = JSON.stringify(rawBody);
    }

    const isValid = verifyCashfreeSignature(
      rawBodyString,
      signature,
      env.CASHFREE_WEBHOOK_SECRET
    );

    if (!isValid) {
      logger.warn("Webhook signature verification failed", {
        provided: signature.substring(0, 10) + "...",
      });
      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    // 2️⃣ PARSE WEBHOOK DATA (NOW VERIFIED)
    let webhookData;
    if (typeof req.body === "string") {
      webhookData = JSON.parse(req.body);
    } else {
      webhookData = req.body;
    }

    // 3️⃣ PROCESS WEBHOOK
    const success = await paymentService.handlePaymentWebhook(webhookData);

    if (success) {
      res.json({
        success: true,
        message: "Webhook processed",
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to process webhook",
      });
    }
  } catch (err) {
    logger.error("Webhook error", {
      error: err.message,
      stack: err.stack,
    });
    res.status(500).json({
      success: false,
      message: "Webhook processing error",
    });
  }
};

/**
 * GET /api/payments/verify/:orderId
 * Verify payment status (optional, for reconciliation)
 */
export const verifyPayment = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const status = await paymentService.verifyPaymentStatus(orderId);

    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/retry/:orderId
 * Retry payment for a failed order
 * 
 * Checks:
 * - Order exists
 * - Payment status is FAILED
 * - User owns the order
 * 
 * Returns new payment session
 */
export const retryPayment = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // 1️⃣ FETCH ORDER
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    // 2️⃣ VERIFY USER OWNS ORDER
    if (order.userId !== req.user.id) {
      throw new AppError("Unauthorized to retry payment for this order", 403);
    }

    // 3️⃣ CHECK IF PAYMENT CAN BE RETRIED
    if (order.paymentStatus !== "FAILED") {
      return res.status(400).json({
        success: false,
        message: `Cannot retry payment. Current status: ${order.paymentStatus}`,
      });
    }

    // 4️⃣ CREATE NEW PAYMENT SESSION
    const session = await paymentService.createPaymentSession(
      orderId,
      req.user
    );

    logger.info("Payment retry initiated", {
      orderId,
      userId: req.user.id,
      previousStatus: "FAILED",
    });

    res.json({
      success: true,
      message: "Payment session created for retry",
      data: session,
    });
  } catch (err) {
    next(err);
  }
};
