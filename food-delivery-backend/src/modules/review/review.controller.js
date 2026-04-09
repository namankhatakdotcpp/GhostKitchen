import { prisma } from "../../config/prisma.js";
import { logger } from "../../utils/logger.js";

/**
 * Create a review for an order
 * Only allow review after order is delivered
 */
export const createReview = async (req, res, next) => {
  try {
    const { orderId, rating, comment } = req.body;
    const userId = req.user.id;

    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    // Check if order exists and belongs to user
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { orderItems: true },
    });

    if (!order || order.userId !== userId) {
      return res
        .status(404)
        .json({ error: "Order not found or unauthorized" });
    }

    // Check if order is delivered
    if (order.status !== "DELIVERED") {
      return res.status(400).json({ error: "Can only review delivered orders" });
    }

    // Check if review already exists
    const existingReview = await prisma.review.findUnique({
      where: { orderId },
    });

    if (existingReview) {
      return res.status(400).json({ error: "Order already reviewed" });
    }

    // Create review
    const review = await prisma.review.create({
      data: {
        orderId,
        rating,
        comment: comment || null,
      },
    });

    logger.info(`Review created for order ${orderId} by user ${userId}`);

    res.json({
      success: true,
      review,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get reviews for a restaurant
 * Based on delivered orders
 */
export const getRestaurantReviews = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;

    // Get all orders from this restaurant with reviews
    const reviews = await prisma.review.findMany({
      where: {
        order: {
          orderItems: {
            some: {
              menuItem: {
                restaurantId,
              },
            },
          },
        },
      },
      include: {
        order: {
          include: {
            user: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10, // Get latest 10 reviews
    });

    // Format response
    const formattedReviews = reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      userName: review.order.user.name,
      createdAt: review.createdAt,
    }));

    // Calculate average rating
    const avgRating =
      reviews.length > 0
        ? (
            reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          ).toFixed(1)
        : 0;

    res.json({
      averageRating: parseFloat(avgRating),
      totalReviews: reviews.length,
      reviews: formattedReviews,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single row review by order ID
 */
export const getReviewByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const review = await prisma.review.findUnique({
      where: { orderId },
      include: {
        order: {
          include: {
            user: {
              select: { name: true },
            },
          },
        },
      },
    });

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    res.json({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      userName: review.order.user.name,
      createdAt: review.createdAt,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update review (only by the reviewer)
 */
export const updateReview = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.id;

    // Check if review exists
    const review = await prisma.review.findUnique({
      where: { orderId },
      include: { order: true },
    });

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    // Check if user is the reviewer
    if (review.order.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized to update this review" });
    }

    // Validate rating if provided
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    // Update review
    const updatedReview = await prisma.review.update({
      where: { id: review.id },
      data: {
        ...(rating && { rating }),
        ...(comment !== undefined && { comment: comment || null }),
      },
    });

    logger.info(`Review updated for order ${orderId} by user ${userId}`);

    res.json({
      success: true,
      review: updatedReview,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete review (only by the reviewer)
 */
export const deleteReview = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    // Check if review exists
    const review = await prisma.review.findUnique({
      where: { orderId },
      include: { order: true },
    });

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    // Check if user is the reviewer
    if (review.order.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized to delete this review" });
    }

    // Delete review
    await prisma.review.delete({
      where: { id: review.id },
    });

    logger.info(`Review deleted for order ${orderId} by user ${userId}`);

    res.json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
