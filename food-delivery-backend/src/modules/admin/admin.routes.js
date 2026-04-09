/**
 * Admin Routes
 * 
 * All routes require:
 * - Authentication (authenticate middleware)
 * - Authorization (admin role check)
 */

import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  getAdminStats,
  assignDeliveryPartner,
} from "./admin.controller.js";

const router = express.Router();

// Apply authentication and authorization to all admin routes
router.use(authenticate);
router.use(authorize("ADMIN"));

/**
 * GET /api/admin/stats
 * Admin dashboard statistics
 */
router.get("/stats", getAdminStats);

/**
 * GET /api/admin/orders
 * Fetch all orders with optional filters
 * Query params:
 * - status: Order status filter (PENDING, CONFIRMED, etc.)
 * - startDate: Date range start
 * - endDate: Date range end
 * - restaurantId: Filter by restaurant
 * - userId: Filter by customer
 */
router.get("/orders", getAllOrders);

/**
 * GET /api/admin/orders/:id
 * Fetch single order details
 */
router.get("/orders/:id", getOrderById);

/**
 * PATCH /api/admin/orders/:id/status
 * Update order status
 * Body:
 * - status: New status (PENDING, CONFIRMED, PREPARING, OUT_FOR_DELIVERY, DELIVERED, CANCELLED)
 * - reason: Optional reason for status change
 */
router.patch("/orders/:id/status", updateOrderStatus);

/**
 * PATCH /api/admin/orders/:id/cancel
 * Cancel order (admin override)
 * Body:
 * - reason: Optional cancellation reason
 */
router.patch("/orders/:id/cancel", cancelOrder);

/**
 * POST /api/admin/orders/:id/assign-delivery
 * Assign delivery partner to order
 * Body:
 * - deliveryUserId: ID of delivery partner
 */
router.post("/orders/:id/assign-delivery", assignDeliveryPartner);

export default router;
