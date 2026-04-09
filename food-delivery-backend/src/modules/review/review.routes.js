import express from "express";
import * as reviewController from "./review.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * Review Routes
 * - All POST/PUT/DELETE routes require authentication (protected)
 * - GET routes are public
 */

/**
 * POST /api/reviews/create
 * Create a review for a delivered order
 * 
 * Request:
 * {
 *   "orderId": "order-uuid",
 *   "rating": 4,
 *   "comment": "Great food!"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "review": {
 *     "id": "review-uuid",
 *     "orderId": "order-uuid",
 *     "rating": 4,
 *     "comment": "Great food!",
 *     "createdAt": "2025-04-11T..."
 *   }
 * }
 */
router.post("/create", authenticate, reviewController.createReview);

/**
 * GET /api/reviews/restaurant/:restaurantId
 * Get all reviews for a restaurant (public)
 * 
 * Response:
 * {
 *   "averageRating": 4.5,
 *   "totalReviews": 12,
 *   "reviews": [
 *     {
 *       "id": "review-uuid",
 *       "rating": 5,
 *       "comment": "Excellent!",
 *       "userName": "John",
 *       "createdAt": "2025-04-11T..."
 *     }
 *   ]
 * }
 */
router.get("/restaurant/:restaurantId", reviewController.getRestaurantReviews);

/**
 * GET /api/reviews/order/:orderId
 * Get review for specific order (public)
 * 
 * Response:
 * {
 *   "id": "review-uuid",
 *   "rating": 4,
 *   "comment": "Good food",
 *   "userName": "John",
 *   "createdAt": "2025-04-11T..."
 * }
 */
router.get("/order/:orderId", reviewController.getReviewByOrderId);

/**
 * PUT /api/reviews/order/:orderId
 * Update review (only by reviewer)
 * 
 * Request:
 * {
 *   "rating": 3,
 *   "comment": "Actually was okay"
 * }
 */
router.put("/order/:orderId", authenticate, reviewController.updateReview);

/**
 * DELETE /api/reviews/order/:orderId
 * Delete review (only by reviewer)
 */
router.delete("/order/:orderId", authenticate, reviewController.deleteReview);

export default router;
