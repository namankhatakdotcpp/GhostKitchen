import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { prisma } from "../../config/prisma.js";
import { calculateOrderPreview, getOrder, getOrders, hideFromShopBoard, placeOrder, updateOrderStatusHTTP, reorderHTTP } from "./orders.controller.js";

const router = express.Router();

router.get("/donation-total", authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const result = await prisma.order.aggregate({
      where: { customerId: userId, status: "DELIVERED" },
      _sum: { donationAmountPaise: true },
    });
    res.json({ totalPaise: result._sum.donationAmountPaise ?? 0 });
  } catch (err) {
    next(err);
  }
});

router.get("/", authenticate, getOrders);
router.post("/calculate", authenticate, calculateOrderPreview);
router.get("/:id", authenticate, getOrder);
router.post("/", authenticate, placeOrder);
router.patch("/:id/status", authenticate, updateOrderStatusHTTP);
router.patch("/:id/hide-from-board", authenticate, hideFromShopBoard);
router.post("/:id/reorder", authenticate, reorderHTTP);

export default router;
