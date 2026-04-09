import express from "express";

import { authenticate } from "../../middlewares/auth.middleware.js";
import { getOrder, getOrders, placeOrder, updateOrderStatusHTTP } from "./orders.controller.js";

const router = express.Router();

router.get("/", authenticate, getOrders);
router.get("/:id", authenticate, getOrder);
router.post("/", authenticate, placeOrder);
router.patch("/:id/status", authenticate, updateOrderStatusHTTP);

export default router;
