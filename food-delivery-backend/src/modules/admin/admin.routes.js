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
  getUsers,
  getRestaurants,
  getRestaurantDetail,
  updateRestaurant,
  getAdminPayments,
  getAdminCoupons,
  createAdminCoupon,
  updateAdminCoupon,
  deleteAdminCoupon,
  updateUserRole,
  updateUser,
  blockUser,
  changeUserRole,
  grantRole,
  revokeRole,
  deleteUser,
  suspendUser,
  suspendRestaurant,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  getReviews,
  deleteReview,
  getAuditLogEntries,
  getSettings,
  updateSettings,
  approveRestaurant,
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
router.get("/users", getUsers);
router.get("/restaurants", getRestaurants);
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

router.get("/payments", getAdminPayments);
router.get("/coupons", getAdminCoupons);
router.post("/coupons", createAdminCoupon);
router.put("/coupons/:id", updateAdminCoupon);
router.delete("/coupons/:id", deleteAdminCoupon);
router.patch("/users/:id/role", updateUserRole);
router.patch("/users/:id/block", blockUser);
router.patch("/users/:id/suspend", suspendUser);
router.patch("/users/:id/change-role", changeUserRole);
router.post("/users/:id/grant-role", grantRole);
router.post("/users/:id/revoke-role", revokeRole);
router.delete("/users/:id", deleteUser);
router.patch("/users/:id", updateUser);
router.get("/restaurants/:id", getRestaurantDetail);
router.patch("/restaurants/:id/suspend", suspendRestaurant);
router.patch("/restaurants/:id", updateRestaurant);
router.get("/menu-items", getMenuItems);
router.post("/menu-items", createMenuItem);
router.patch("/menu-items/:id", updateMenuItem);
router.delete("/menu-items/:id", deleteMenuItem);
router.get("/reviews", getReviews);
router.delete("/reviews/:id", deleteReview);
router.get("/audit-log", getAuditLogEntries);
router.get("/settings", getSettings);
router.patch("/settings", updateSettings);
router.patch("/restaurants/:id/approve", approveRestaurant);

export default router;
