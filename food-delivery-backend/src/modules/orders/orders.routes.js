import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { calculateOrderPreview, getOrder, getOrders, hideFromShopBoard, placeOrder, updateOrderStatusHTTP, reorderHTTP } from "./orders.controller.js";

const router = express.Router();

router.get("/", authenticate, getOrders);
router.post("/calculate", authenticate, calculateOrderPreview);
router.get("/:id", authenticate, getOrder);
router.post("/", authenticate, placeOrder);
router.patch("/:id/status", authenticate, updateOrderStatusHTTP);
router.patch("/:id/hide-from-board", authenticate, hideFromShopBoard);
router.post("/:id/reorder", authenticate, reorderHTTP);

export default router;
