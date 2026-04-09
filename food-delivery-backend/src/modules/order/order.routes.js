import express from "express";
import * as orderController from "./order.controller.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * Order Routes
 * 
 * All routes are protected - requires authentication
 * Middleware: authMiddleware (applied to all routes)
 */
router.use(authMiddleware);

/**
 * POST /api/order/create
 * Create order from cart
 * 
 * Request:
 * - No body required
 * - Uses cart items automatically
 * 
 * Response:
 * {
 *   "id": "order-uuid",
 *   "userId": "user-uuid",
 *   "totalAmount": 599.99,
 *   "status": "PENDING",
 *   "paymentStatus": "PENDING",
 *   "orderItems": [
 *     {
 *       "id": "item-uuid",
 *       "menuItemId": "menuitem-uuid",
 *       "quantity": 2,
 *       "price": 299.99
 *     }
 *   ]
 * }
 */
router.post("/create", orderController.create);

/**
 * GET /api/order
 * Get all orders for user
 * 
 * Response: Array of orders with items, sorted by newest first
 */
router.get("/", orderController.getUserOrders);

/**
 * GET /api/order/:id
 * Get single order by ID
 * 
 * Verification: Must be order owner
 */
router.get("/:id", orderController.getOrderById);

/**
 * PATCH /api/order/:id/status
 * Update order status (for admin/system)
 * 
 * Request Body:
 * {
 *   "status": "CONFIRMED" | "PREPARING" | "OUT_FOR_DELIVERY" | "DELIVERED"
 * }
 */
router.patch("/:id/status", orderController.updateStatus);

/**
 * PATCH /api/order/:id/payment-status
 * Update payment status after payment processing
 * 
 * Request Body:
 * {
 *   "paymentStatus": "SUCCESS" | "FAILED"
 * }
 */
router.patch("/:id/payment-status", orderController.updatePaymentStatus);

/**
 * DELETE /api/order/:id
 * Cancel order
 * 
 * Restrictions:
 * - Can't cancel if already delivered
 * - Can't cancel own cancelled orders
 */
router.delete("/:id", orderController.cancel);

export default router;
