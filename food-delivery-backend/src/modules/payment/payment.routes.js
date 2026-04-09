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
 * 
 * Webhook data includes:
 * - order_id: Order ID
 * - payment.payment_status: SUCCESS | FAILED | CANCELLED
 */
router.post("/webhook", express.json(), paymentController.webhook);

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

export default router;
