import express from "express";
import { createPaymentOrder, verifyPayment } from "./payment.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// Middleware to check if Cashfree is properly configured
const cashfreeMiddleware = (req, res, next) => {
  if (!process.env.CASHFREE_APP_ID || !process.env.CASHFREE_SECRET_KEY) {
    return res.status(503).json({
      message: "Payment service is not configured. Please contact support.",
    });
  }
  next();
};

router.post(
  "/create-order",
  authMiddleware,
  cashfreeMiddleware,
  createPaymentOrder
);
router.post("/verify", authMiddleware, cashfreeMiddleware, verifyPayment);

export default router;
