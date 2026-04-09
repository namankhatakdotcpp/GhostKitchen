import * as paymentService from "./payment.service.js";

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
 * 🔐 NOTE: This endpoint should NOT require authentication
 * It's called by Cashfree servers, not your frontend
 */
export const webhook = async (req, res, next) => {
  try {
    const webhookData = req.body;

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
    console.error("Webhook error:", err);
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

