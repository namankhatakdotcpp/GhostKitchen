import { prisma } from "../../config/prisma.js";
import { logger } from "../../utils/logger.js";

export const createReview = async (req, res, next) => {
  let resolvedRestaurantId = null;
  let resolvedReviewId = null;
  try {
    const { orderId, rating, comment } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!orderId || typeof orderId !== "string") {
      return res.status(400).json({ error: "orderId is required" });
    }
    // rating may arrive as a string when sent from certain HTTP clients — coerce before checking
    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: "Rating must be an integer between 1 and 5" });
    }
    if (comment !== undefined && comment !== null && (typeof comment !== "string" || comment.length > 1000)) {
      return res.status(400).json({ error: "Comment cannot exceed 1000 characters" });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (order) resolvedRestaurantId = order.restaurantId;

    if (!order || order.customerId !== userId) {
      return res.status(404).json({ error: "Order not found" });
    }
    if (order.status !== "DELIVERED") {
      return res.status(400).json({ error: "You can only review orders that have been delivered" });
    }

    const existingReview = await prisma.review.findUnique({ where: { orderId } });
    if (existingReview) {
      return res.status(400).json({ error: "You have already reviewed this order" });
    }

    let review;
    try {
      review = await prisma.review.create({
        data: { orderId, rating: ratingNum, comment: comment || null },
      });
    } catch (createErr) {
      // Two concurrent submissions slipped past the findUnique guard above.
      // The unique constraint on orderId catches the loser — return 409 rather
      // than a 500 so the client knows not to retry.
      if (createErr.code === "P2002") {
        return res.status(409).json({ error: "You have already reviewed this order" });
      }
      throw createErr;
    }
    resolvedReviewId = review.id;

    // Recalculate restaurant rating
    const agg = await prisma.review.aggregate({
      where: { order: { restaurantId: order.restaurantId } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await prisma.restaurant.update({
      where: { id: order.restaurantId },
      data: {
        rating: Math.round((agg._avg.rating ?? 0) * 10) / 10,
        reviewCount: agg._count.rating,
      },
    });

    logger.info("Review created", {
      reviewId: resolvedReviewId,
      orderId,
      restaurantId: resolvedRestaurantId,
      userId,
      rating: ratingNum,
    });
    res.json({ success: true, review });
  } catch (error) {
    // Full audit trail — every field needed to reproduce the failure in production
    logger.error("Review creation failed", {
      requestId: req.headers?.["x-request-id"] ?? null,
      orderId: req.body?.orderId,
      userId: req.user?.userId,
      restaurantId: resolvedRestaurantId,   // null if order lookup itself failed
      reviewId: resolvedReviewId,           // null if create() failed
      errorCode: error.code,
      errorMeta: error.meta,
      errorMessage: error.message,
      stack: error.stack,
    });
    next(error);
  }
};

export const getRestaurantReviews = async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 10);

    const [reviews, totalReviews] = await prisma.$transaction([
      prisma.review.findMany({
        where: { order: { restaurantId } },
        include: {
          order: {
            include: {
              customer: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.review.count({ where: { order: { restaurantId } } }),
    ]);

    const formattedReviews = reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      userName: review.order.customer.name.split(" ")[0],
      createdAt: review.createdAt,
    }));

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { rating: true, reviewCount: true },
    });

    res.json({
      averageRating: restaurant?.rating ?? 0,
      totalReviews: restaurant?.reviewCount ?? totalReviews,
      page,
      limit,
      hasMore: page * limit < totalReviews,
      reviews: formattedReviews,
    });
  } catch (error) {
    next(error);
  }
};

export const getReviewByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const review = await prisma.review.findUnique({
      where: { orderId },
      include: {
        order: {
          include: { customer: { select: { name: true } } },
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
      userName: review.order.customer.name.split(" ")[0],
      createdAt: review.createdAt,
    });
  } catch (error) {
    next(error);
  }
};

export const canReview = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.customerId !== userId) {
      return res.json({ canReview: false, reason: "Order not found" });
    }
    if (order.status !== "DELIVERED") {
      return res.json({ canReview: false, reason: "Order not yet delivered" });
    }
    const existing = await prisma.review.findUnique({ where: { orderId } });
    if (existing) {
      return res.json({ canReview: false, reason: "Already reviewed" });
    }
    res.json({ canReview: true });
  } catch (error) {
    next(error);
  }
};

export const updateReview = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.userId;

    const review = await prisma.review.findUnique({
      where: { orderId },
      include: { order: true },
    });

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    if (review.order.customerId !== userId) {
      return res.status(403).json({ error: "Unauthorized to update this review" });
    }

    if (rating !== undefined && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      return res.status(400).json({ error: "Rating must be an integer between 1 and 5" });
    }
    if (comment !== undefined && comment !== null && (typeof comment !== "string" || comment.length > 1000)) {
      return res.status(400).json({ error: "Comment cannot exceed 1000 characters" });
    }

    const updatedReview = await prisma.review.update({
      where: { id: review.id },
      data: {
        ...(rating && { rating }),
        ...(comment !== undefined && { comment: comment || null }),
      },
    });

    logger.info(`Review updated for order ${orderId} by user ${userId}`);
    res.json({ success: true, review: updatedReview });
  } catch (error) {
    next(error);
  }
};

export const deleteReview = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.userId;

    const review = await prisma.review.findUnique({
      where: { orderId },
      include: { order: true },
    });

    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }

    if (review.order.customerId !== userId) {
      return res.status(403).json({ error: "Unauthorized to delete this review" });
    }

    await prisma.review.delete({ where: { id: review.id } });

    logger.info(`Review deleted for order ${orderId} by user ${userId}`);
    res.json({ success: true, message: "Review deleted successfully" });
  } catch (error) {
    next(error);
  }
};
