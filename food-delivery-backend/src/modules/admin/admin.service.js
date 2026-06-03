import { prisma } from "../../config/prisma.js";
import { logger } from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import { emitOrderStatusUpdated } from "../../socket/socket.server.js";

const ORDER_INCLUDE = {
  customer: { select: { id: true, email: true, name: true, phone: true } },
  restaurant: { select: { id: true, name: true, address: true } },
  agent: { select: { id: true, name: true, phone: true } },
};

export const getAllOrders = async (filters = {}) => {
  try {
    const where = {};

    if (filters.status) where.status = filters.status.toUpperCase();
    if (filters.restaurantId) where.restaurantId = filters.restaurantId;
    if (filters.userId) where.customerId = filters.userId;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const orders = await prisma.order.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    logger.info("Fetched all orders", { count: orders.length, filters });
    return orders;
  } catch (error) {
    logger.error("Failed to fetch all orders", { error: error.message, filters });
    throw new AppError("Failed to fetch orders", 500);
  }
};

export const getOrderById = async (orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: ORDER_INCLUDE,
  });

  if (!order) throw new AppError("Order not found", 404);
  return order;
};

export const updateOrderStatus = async (orderId, newStatus, reason = null) => {
  const validStatuses = ["PLACED", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];

  if (!validStatuses.includes(newStatus.toUpperCase())) {
    throw new AppError(`Invalid status: ${newStatus}`, 400);
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404);

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { status: newStatus.toUpperCase() },
    include: ORDER_INCLUDE,
  });

  emitOrderStatusUpdated({ orderId, status: newStatus.toUpperCase(), timestamp: new Date().toISOString() });

  logger.warn("Admin updated order status", { orderId, oldStatus: order.status, newStatus, reason });
  return updatedOrder;
};

export const cancelOrder = async (orderId, reason = "Admin cancelled") => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404);
  if (order.status === "DELIVERED") throw new AppError("Cannot cancel delivered orders", 400);

  const cancelledOrder = await prisma.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED" },
    include: ORDER_INCLUDE,
  });

  emitOrderStatusUpdated({ orderId, status: "CANCELLED", timestamp: new Date().toISOString() });

  logger.warn("Admin cancelled order", { orderId, reason });
  return cancelledOrder;
};

export const getAdminStats = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [totalOrders, todayOrders, completedOrders, cancelledOrders, revenueAgg] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: today, lt: tomorrow } } }),
      prisma.order.count({ where: { status: "DELIVERED" } }),
      prisma.order.count({ where: { status: "CANCELLED" } }),
      prisma.order.aggregate({ _sum: { total: true } }),
    ]);

    return {
      totalOrders,
      todayOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue: revenueAgg._sum.total || 0,
      successRate: totalOrders > 0 ? ((completedOrders / totalOrders) * 100).toFixed(2) : 0,
    };
  } catch (error) {
    logger.error("Failed to generate statistics", { error: error.message });
    throw new AppError("Failed to generate statistics", 500);
  }
};

export const assignDeliveryPartner = async (orderId, agentId) => {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Order not found", 404);

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { agentId, status: "OUT_FOR_DELIVERY" },
    include: ORDER_INCLUDE,
  });

  emitOrderStatusUpdated({ orderId, status: "OUT_FOR_DELIVERY", timestamp: new Date().toISOString() });

  logger.info("Admin assigned delivery partner", { orderId, agentId });
  return updatedOrder;
};
