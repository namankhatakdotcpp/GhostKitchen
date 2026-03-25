import express from "express";

import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { getOrder, getOrders, placeOrder } from "./orders.controller.js";

const router = express.Router();

router.get("/", authMiddleware, getOrders);
router.get("/:id", authMiddleware, getOrder);
router.post("/", authMiddleware, placeOrder);

export default router;
