/**
 * Cart Routes
 * 
 * All routes are protected with authenticate middleware
 * User must be logged in to manage cart
 */

import express from "express";
import * as cartController from "./cart.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// POST /api/cart/add - Add item to cart
router.post("/add", cartController.add);

// GET /api/cart - Get user's cart
router.get("/", cartController.get);

// DELETE /api/cart/:id - Remove item from cart
router.delete("/:id", cartController.remove);

// PATCH /api/cart/:id - Update item quantity
router.patch("/:id", cartController.update);

// DELETE /api/cart - Clear entire cart
router.delete("/", cartController.clear);

export default router;
