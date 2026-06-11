import { prisma } from "../../config/prisma.js";
import { logger } from "../../utils/logger.js";

export const createReview = async (req, res, next) => {
  try {
    const { orderId, rating, comment } = req.body;
    const userId = req.user.userId;

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be an integer between 1 and 5" });
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });

    if (!order || order.customerId !== userId) {
      return res.status(404).json({ error: "Order not found or unauthorized" });
    }

    if (order.status !== "DELIVERED") {
      return res.status(400).json({ error: "Can only review delivered orders" });
    }

    const existingReview = await prisma.review.findUnique({ where: { orderId } });
    if (existingReview) {
      return res.status(400).json({ error: "Order already reviewed" });
    }

    const review = await prisma.review.create({
      data: { orderId, rating, comment: comment || null },
    });

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

    logger.info(`Review created for order ${orderId} by user ${userId}`);
    res.json({ success: true, review });
  } catch (error) {
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
      userName: review.order.customer.name,
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
