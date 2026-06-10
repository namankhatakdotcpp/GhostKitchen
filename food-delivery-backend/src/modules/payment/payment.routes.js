import express from "express";
import * as paymentController from "./payment.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { initiateRefund, getRefunds, syncRefundStatus } from "./refund.service.js";
import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";

const router = express.Router();

// ── Customer payment flow ─────────────────────────────────────────────────────

router.post("/create-order", authenticate, roleMiddleware(["CUSTOMER"]), paymentController.createPaymentOrder);
router.post("/verify", authenticate, roleMiddleware(["CUSTOMER"]), paymentController.verifyPaymentAndCreateOrder);
router.get("/history", authenticate, paymentController.getPaymentHistory);
router.post("/create-session", authenticate, paymentController.createSession);
router.post("/webhook", paymentController.webhook);
router.get("/verify/:orderId", authenticate, paymentController.verifyPayment);
router.post("/retry/:orderId", authenticate, paymentController.retryPayment);

// ── Customer refund visibility ────────────────────────────────────────────────

// GET /api/payments/my-refunds — refunds for the current user's orders only
router.get("/my-refunds", authenticate, async (req, res, next) => {
  try {
    const customerId = req.user.userId;
    const userPayments = await prisma.payment.findMany({ where: { customerId }, select: { cfOrderId: true } });
    const cfOrderIds = userPayments.map(p => p.cfOrderId);
    const refunds = await prisma.refund.findMany({
      where: { cfOrderId: { in: cfOrderIds } },
      orderBy: { createdAt: "desc" },
    });
    res.json({ refunds });
  } catch (e) { next(e); }
});

// POST /api/payments/my-refunds/:cfRefundId/sync — customer polls their own refund status
router.post("/my-refunds/:cfRefundId/sync", authenticate, async (req, res, next) => {
  try {
    const { cfRefundId } = req.params;
    const customerId = req.user.userId;
    const refund = await prisma.refund.findUnique({ where: { cfRefundId } });
    if (!refund) throw new AppError("Refund not found", 404);
    const payment = await prisma.payment.findFirst({ where: { cfOrderId: refund.cfOrderId, customerId } });
    if (!payment) throw new AppError("Unauthorized", 403);
    const updated = await syncRefundStatus(cfRefundId);
    res.json({ refund: updated });
  } catch (e) { next(e); }
});

// ── Admin refund routes ───────────────────────────────────────────────────────

// GET /api/payments/refunds — list all refunds (admin only)
router.get("/refunds", authenticate, roleMiddleware(["ADMIN"]), async (req, res, next) => {
  try {
    const { cfOrderId, page = "1", limit = "50" } = req.query;
    const result = await getRefunds({
      cfOrderId: cfOrderId || undefined,
      page: Number(page),
      limit: Math.min(Number(limit), 100),
    });
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/payments/refunds — initiate refund (admin only)
router.post("/refunds", authenticate, roleMiddleware(["ADMIN"]), async (req, res, next) => {
  try {
    const { cfOrderId, amount, reason } = req.body;
    if (!cfOrderId) throw new AppError("cfOrderId is required", 400);
    const refund = await initiateRefund({
      cfOrderId,
      amount: amount != null ? Number(amount) : undefined,
      reason,
      adminId: req.user.userId,
      req,
    });
    res.status(201).json({ refund });
  } catch (e) { next(e); }
});

// POST /api/payments/refunds/:cfRefundId/sync — sync status from Cashfree (admin)
router.post("/refunds/:cfRefundId/sync", authenticate, roleMiddleware(["ADMIN"]), async (req, res, next) => {
  try {
    const refund = await syncRefundStatus(req.params.cfRefundId);
    res.json({ refund });
  } catch (e) { next(e); }
});

export default router;
