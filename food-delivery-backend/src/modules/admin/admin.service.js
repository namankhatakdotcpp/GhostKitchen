/**
 * Admin Service
 * 
 * Business logic for admin operations:
 * - Retrieve all orders with filtering
 * - Update order status (with real-time socket emission)
 * - Generate admin reports
 * - System diagnostics
 */

import { prisma } from "../../config/prisma.js";
import { emitOrderUpdate, emitOrderCancelled } from "../../socket/socketEvents.js";
import { logger } from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";

/**
 * Get all orders with optional filtering
 * Admin can see every order in the system
 * 
 * Options:
 * - status: Filter by order status
 * - startDate, endDate: Filter by date range
 * - restaurantId: Filter by restaurant
 * - userId: Filter by customer
 */
export const getAllOrders = async (filters = {}) => {
  try {
    const whereClause = {};

    // Apply filters
    if (filters.status) {
      whereClause.status = filters.status.toUpperCase();
    }

    if (filters.startDate || filters.endDate) {
      whereClause.createdAt = {};
      if (filters.startDate) {
        whereClause.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        whereClause.createdAt.lte = new Date(filters.endDate);
      }
    }

    if (filters.restaurantId) {
      whereClause.restaurantId = filters.restaurantId;
    }

    if (filters.userId) {
      whereClause.userId = filters.userId;
    }

    const orders = await prisma.order.findMany({
      where: whereClause,
      include: {
        orderItems: {
          include: {
            menuItem: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        deliveryUser: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    logger.info("Fetched all orders", {
      count: orders.length,
      filters,
    });

    return orders;
  } catch (error) {
    logger.error("Failed to fetch all orders", {
      error: error.message,
      filters,
    });
    throw new AppError("Failed to fetch orders", 500);
  }
};

/**
 * Get order by ID (admin view)
 */
export const getOrderById = async (orderId) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: {
          include: {
            menuItem: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            address: true,
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        deliveryUser: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    return order;
  } catch (error) {
    logger.error("Failed to fetch order", {
      orderId,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Update order status (admin override)
 * Can manually update any order status
 * Emits real-time socket event
 */
export const updateOrderStatus = async (orderId, newStatus, reason = null) => {
  try {
    const validStatuses = [
      "PENDING",
      "CONFIRMED",
      "PREPARING",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED",
    ];

    if (!validStatuses.includes(newStatus.toUpperCase())) {
      throw new AppError(`Invalid status: ${newStatus}`, 400);
    }

    // Fetch current order
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: true,
      },
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: newStatus.toUpperCase(),
        updatedAt: new Date(),
      },
      include: {
        orderItems: {
          include: {
            menuItem: true,
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Emit real-time socket update
    emitOrderUpdate(updatedOrder);

    logger.warn("Admin updated order status", {
      orderId,
      oldStatus: order.status,
      newStatus,
      reason,
    });

    return updatedOrder;
  } catch (error) {
    logger.error("Failed to update order status", {
      orderId,
      newStatus,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Cancel order (admin override)
 */
export const cancelOrder = async (orderId, reason = "Admin cancelled") => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        orderItems: true,
      },
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    if (order.status === "DELIVERED") {
      throw new AppError("Cannot cancel delivered orders", 400);
    }

    const cancelledOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        updatedAt: new Date(),
      },
      include: {
        orderItems: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Emit cancellation event
    emitOrderCancelled(cancelledOrder, reason);

    logger.warn("Admin cancelled order", {
      orderId,
      reason,
    });

    return cancelledOrder;
  } catch (error) {
    logger.error("Failed to cancel order", {
      orderId,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Get admin statistics
 */
export const getAdminStats = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalOrders,
      todayOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue,
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({
        where: {
          createdAt: {
            gte: today,
            lt: tomorrow,
          },
        },
      }),
      prisma.order.count({
        where: {
          status: "DELIVERED",
        },
      }),
      prisma.order.count({
        where: {
          status: "CANCELLED",
        },
      }),
      prisma.order.aggregate({
        _sum: {
          totalAmount: true,
        },
      }),
    ]);

    logger.info("Generated admin statistics");

    return {
      totalOrders,
      todayOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue: totalRevenue._sum.totalAmount || 0,
      successRate: totalOrders > 0 
        ? ((completedOrders / totalOrders) * 100).toFixed(2)
        : 0,
    };
  } catch (error) {
    logger.error("Failed to generate statistics", {
      error: error.message,
    });
    throw new AppError("Failed to generate statistics", 500);
  }
};

/**
 * Assign delivery partner to order (admin operation)
 */
export const assignDeliveryPartner = async (orderId, deliveryUserId) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new AppError("Order not found", 404);
    }

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: {
        deliveryUserId,
        status: "OUT_FOR_DELIVERY",
      },
      include: {
        orderItems: true,
      },
    });

    emitOrderUpdate(updatedOrder);

    logger.info("Admin assigned delivery partner", {
      orderId,
      deliveryUserId,
    });

    return updatedOrder;
  } catch (error) {
    logger.error("Failed to assign delivery partner", {
      orderId,
      error: error.message,
    });
    throw error;
  }
};
