import express from "express";
import * as paymentController from "./payment.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * Payment Routes
 * 
 * Flow:
 * 1. User creates order (POST /api/orders/create)
 * 2. Frontend calls POST /payments/create-session with orderId
 * 3. Opens Cashfree payment UI with session_id
 * 4. User completes payment
 * 5. Cashfree sends webhook to POST /payments/webhook
 * 6. Order status updated to SUCCESS/FAILED
 */

/**
 * POST /api/payments/create-session
 * Create payment session for existing order
 * 
 * Required: authMiddleware (user must own the order)
 */
router.post(
  "/create-session",
  authMiddleware,
  paymentController.createSession
);

/**
 * POST /api/payments/webhook
 * Receive webhook from Cashfree after payment
 * 
 * 🔐 NOT protected - Cashfree servers need to call this
 * 🔐 CRITICAL: Uses express.raw() to preserve body for signature verification
 * 
 * Webhook data includes:
 * - order_id: Order ID
 * - payment.payment_status: SUCCESS | FAILED | CANCELLED
 */
router.post("/webhook", express.raw({ type: "application/json" }), (req, res, next) => {
  // Store raw body for signature verification
  req.rawBody = req.body;
  
  // Parse body if it's a buffer
  if (Buffer.isBuffer(req.body)) {
    try {
      req.body = JSON.parse(req.body.toString());
    } catch (e) {
      return res.status(400).json({ error: "Invalid JSON" });
    }
  }
  
  // Call the webhook controller
  paymentController.webhook(req, res, next);
});

/**
 * GET /api/payments/verify/:orderId
 * Manually verify payment status (optional)
 * 
 * Used for reconciliation or if webhook didn't fire
 */
router.get(
  "/verify/:orderId",
  authMiddleware,
  paymentController.verifyPayment
);

/**
 * POST /api/payments/retry/:orderId
 * Retry payment for a failed order
 * 
 * Required: authMiddleware (user must own the order)
 * Returns new payment session
 */
router.post(
  "/retry/:orderId",
  authMiddleware,
  paymentController.retryPayment
);

export default router;
