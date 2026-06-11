import express from "express";
import * as couponController from "./coupon.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";

const router = express.Router();

/**
 * Coupon Routes
 * - Validation routes are public
 * - Admin routes require authentication and admin role
 */

/**
 * POST /api/coupons/validate
 * Validate coupon code and calculate discount (public)
 * 
 * Request:
 * {
 *   "code": "SUMMER50",
 *   "orderTotal": 599.99
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "coupon": {
 *     "code": "SUMMER50",
 *     "discountType": "PERCENTAGE",
 *     "discountValue": 50,
 *     "discountAmount": 300.00,
 *     "originalTotal": 599.99,
 *     "finalAmount": 299.99
 *   }
 * }
 */
router.post("/validate", couponController.validateCoupon);

// NOTE: the old public POST /apply endpoint is gone — it let anyone exhaust a
// coupon's usage limit without ordering. Usage is now counted atomically
// inside order creation / payment capture.

/**
 * GET /api/coupons/active
 * Get all active coupons (public - for customer display)
 * 
 * Response:
 * {
 *   "coupons": [
 *     {
 *       "id": "coupon-uuid",
 *       "code": "SUMMER50",
 *       "discountType": "PERCENTAGE",
 *       "discountValue": 50,
 *       "minOrder": 200,
 *       "availableUses": 95,
 *       "expiresAt": "2025-06-30T..."
 *     }
 *   ]
 * }
 */
router.get("/active", couponController.getActiveCoupons);
router.get("/available", couponController.getAvailableCoupons);

/**
 * GET /api/coupons/:code
 * Get coupon details by code (public)
 * 
 * Response:
 * {
 *   "coupon": {
 *     "id": "coupon-uuid",
 *     "code": "SUMMER50",
 *     "discountType": "PERCENTAGE",
 *     "discountValue": 50,
 *     "minOrder": 200,
 *     "maxUses": 100,
 *     "usedCount": 5,
 *     "availableUses": 95,
 *     "expiresAt": "2025-06-30T..."
 *   }
 * }
 */
router.get("/:code", couponController.getCouponByCode);

/**
 * ADMIN ROUTES (require authentication)
 */

/**
 * POST /api/coupons/admin/create
 * Create new coupon (admin only)
 * 
 * Request:
 * {
 *   "code": "SUMMER50",
 *   "discountType": "PERCENTAGE",
 *   "discountValue": 50,
 *   "minOrder": 200,
 *   "maxUses": 100,
 *   "expiresAt": "2025-06-30"
 * }
 */
router.post("/admin/create", authenticate, roleMiddleware(["ADMIN"]), couponController.createCoupon);

/**
 * PUT /api/coupons/admin/:code
 * Update coupon (admin only)
 * 
 * Request:
 * {
 *   "maxUses": 150,
 *   "expiresAt": "2025-07-31"
 * }
 */
router.put("/admin/:code", authenticate, roleMiddleware(["ADMIN"]), couponController.updateCoupon);

/**
 * DELETE /api/coupons/admin/:code
 * Delete coupon (admin only)
 */
router.delete("/admin/:code", authenticate, roleMiddleware(["ADMIN"]), couponController.deleteCoupon);

export default router;
