import { prisma } from "../../config/prisma.js";
import { logger } from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import { getIO } from "../../socket/socketServer.js";

function emitOrderStatusUpdated(data) {
  try { getIO().to('admin').emit('order_status_updated', data) } catch {}
}

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
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

    const [ordersToday, revenueAgg, activeRestaurants, availableAgents, pendingOrders, recentOrders] =
      await prisma.$transaction([
        prisma.order.count({ where: { placedAt: { gte: today, lt: tomorrow } } }),
        prisma.order.aggregate({ _sum: { total: true }, where: { status: 'DELIVERED', placedAt: { gte: today, lt: tomorrow } } }),
        prisma.restaurant.count({ where: { isOpen: true } }),
        prisma.user.count({ where: { isAvailable: true, roles: { has: 'DELIVERY' } } }),
        prisma.order.count({ where: { status: 'PLACED', placedAt: { lt: fifteenMinsAgo } } }),
        prisma.order.findMany({
          take: 10,
          orderBy: { placedAt: 'desc' },
          include: {
            customer: { select: { name: true } },
            restaurant: { select: { name: true } },
          },
        }),
      ])

    return {
      ordersToday,
      revenueToday: (revenueAgg._sum.total || 0) / 100,
      activeRestaurants,
      availableAgents,
      pendingOrders,
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        customerName: o.customer.name,
        restaurantName: o.restaurant.name,
        total: o.total,
        status: o.status,
      })),
    };
  } catch (error) {
    logger.error("Failed to generate statistics", { error: error.message });
    throw new AppError("Failed to generate statistics", 500);
  }
};

export const getUsers = async ({ page = 1, limit = 20, role, search } = {}) => {
  const where = {}
  if (role) where.roles = { has: role }
  if (search) where.OR = [
    { name: { contains: search, mode: 'insensitive' } },
    { email: { contains: search, mode: 'insensitive' } },
  ]
  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, email: true, phone: true, roles: true, activeRole: true, createdAt: true },
    }),
    prisma.user.count({ where }),
  ])
  return { users, total, page: Number(page), limit: Number(limit) }
};

export const getRestaurants = async ({ page = 1, limit = 20, search } = {}) => {
  const where = {}
  if (search) where.name = { contains: search, mode: 'insensitive' }
  const [restaurants, total] = await prisma.$transaction([
    prisma.restaurant.findMany({
      where,
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { name: true, email: true } },
        _count: { select: { orders: true } },
      },
    }),
    prisma.restaurant.count({ where }),
  ])
  return { restaurants, total, page: Number(page), limit: Number(limit) }
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
