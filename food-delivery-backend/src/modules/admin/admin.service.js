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
      select: { id: true, name: true, email: true, phone: true, roles: true, activeRole: true, isBlocked: true, isSuspended: true, createdAt: true },
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

export const getAdminPayments = async ({ page = 1, limit = 20, status } = {}) => {
  const where = {};
  if (status) where.status = status;
  const [payments, total] = await prisma.$transaction([
    prisma.payment.findMany({
      where,
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    }),
    prisma.payment.count({ where }),
  ]);
  // Enrich with customer/restaurant names
  const enriched = await Promise.all(
    payments.map(async (p) => {
      const customer = await prisma.user.findUnique({ where: { id: p.customerId }, select: { name: true } });
      const restaurant = await prisma.restaurant.findUnique({ where: { id: p.restaurantId }, select: { name: true } });
      const order = await prisma.order.findFirst({ where: { cfOrderId: p.cfOrderId }, select: { id: true } });
      return { ...p, customerName: customer?.name, restaurantName: restaurant?.name, orderId: order?.id };
    })
  );
  return { payments: enriched, total, page: Number(page), limit: Number(limit) };
};

export const getAdminCoupons = async ({ page = 1, limit = 20 } = {}) => {
  const [coupons, total] = await prisma.$transaction([
    prisma.coupon.findMany({
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    }),
    prisma.coupon.count(),
  ]);
  return { coupons, total, page: Number(page), limit: Number(limit) };
};

export const createAdminCoupon = async ({ code, discountType, discountValue, minOrder, maxUses, expiresAt, description, restaurantId, isActive = true }) => {
  return prisma.coupon.create({
    data: {
      code: code.toUpperCase(),
      description: description ?? null,
      discountType,
      discountValue: parseFloat(discountValue),
      minOrder: parseFloat(minOrder),
      maxUses: Number(maxUses),
      expiresAt: new Date(expiresAt),
      restaurantId: restaurantId ?? null,
      isActive,
    },
  });
};

export const updateAdminCoupon = async (id, updates) => {
  const data = {};
  if (updates.code) data.code = updates.code.toUpperCase();
  if (updates.description !== undefined) data.description = updates.description;
  if (updates.discountType) data.discountType = updates.discountType;
  if (updates.discountValue !== undefined) data.discountValue = parseFloat(updates.discountValue);
  if (updates.minOrder !== undefined) data.minOrder = parseFloat(updates.minOrder);
  if (updates.maxUses !== undefined) data.maxUses = Number(updates.maxUses);
  if (updates.expiresAt) data.expiresAt = new Date(updates.expiresAt);
  if (updates.isActive !== undefined) data.isActive = updates.isActive;
  if (updates.restaurantId !== undefined) data.restaurantId = updates.restaurantId;
  return prisma.coupon.update({ where: { id }, data });
};

export const deleteAdminCoupon = async (id) => {
  await prisma.coupon.update({ where: { id }, data: { isActive: false } });
};

export const updateUserRole = async (id, { roles, activeRole }) => {
  return prisma.user.update({
    where: { id },
    data: { roles, activeRole },
    select: { id: true, name: true, email: true, roles: true, activeRole: true },
  });
};

export const suspendRestaurant = async (id) => {
  const r = await prisma.restaurant.findUnique({ where: { id }, select: { suspended: true } });
  if (!r) throw new AppError("Restaurant not found", 404);
  return prisma.restaurant.update({
    where: { id },
    data: { isOpen: r.suspended ? true : false, suspended: !r.suspended },
  });
};

export const setRestaurantApproval = async (id, approve) => {
  return prisma.restaurant.update({
    where: { id },
    data: { isApproved: !!approve },
  });
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

// ─── Restaurant Detail ────────────────────────────────────────────────────────

export const getRestaurantDetail = async (id) => {
  const restaurant = await prisma.restaurant.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true } },
      menuItems: { orderBy: { sortOrder: "asc" } },
      orders: {
        take: 50,
        orderBy: { createdAt: "desc" },
        include: {
          customer: { select: { id: true, name: true, email: true } },
          agent: { select: { id: true, name: true, phone: true } },
        },
      },
      _count: { select: { orders: true, menuItems: true } },
    },
  });
  if (!restaurant) throw new AppError("Restaurant not found", 404);
  return restaurant;
};

export const updateRestaurant = async (id, data) => {
  const update = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.description !== undefined) update.description = data.description;
  if (data.isOpen !== undefined) update.isOpen = data.isOpen;
  if (data.cuisines !== undefined) update.cuisines = data.cuisines;
  if (data.suspended !== undefined) update.suspended = data.suspended;
  return prisma.restaurant.update({ where: { id }, data: update });
};

// ─── Menu Items ───────────────────────────────────────────────────────────────

export const getMenuItems = async ({ restaurantId, page = 1, limit = 50 } = {}) => {
  const where = {};
  if (restaurantId) where.restaurantId = restaurantId;
  const [items, total] = await prisma.$transaction([
    prisma.menuItem.findMany({
      where,
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      include: { restaurant: { select: { name: true } } },
    }),
    prisma.menuItem.count({ where }),
  ]);
  return { items, total, page: Number(page), limit: Number(limit) };
};

export const createMenuItem = async (data) => {
  return prisma.menuItem.create({
    data: {
      restaurantId: data.restaurantId,
      name: data.name,
      description: data.description,
      price: parseFloat(data.price),
      category: data.category,
      imageUrl: data.imageUrl || "",
      isVeg: data.isVeg ?? false,
      isAvailable: data.isAvailable ?? true,
      isBestseller: data.isBestseller ?? false,
      sortOrder: Number(data.sortOrder) || 0,
    },
  });
};

export const updateMenuItem = async (id, data) => {
  const update = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.description !== undefined) update.description = data.description;
  if (data.price !== undefined) update.price = parseFloat(data.price);
  if (data.category !== undefined) update.category = data.category;
  if (data.imageUrl !== undefined) update.imageUrl = data.imageUrl;
  if (data.isVeg !== undefined) update.isVeg = data.isVeg;
  if (data.isAvailable !== undefined) update.isAvailable = data.isAvailable;
  if (data.isBestseller !== undefined) update.isBestseller = data.isBestseller;
  if (data.sortOrder !== undefined) update.sortOrder = Number(data.sortOrder);
  return prisma.menuItem.update({ where: { id }, data: update });
};

export const deleteMenuItem = async (id) => {
  await prisma.menuItem.delete({ where: { id } });
};

// ─── Reviews ─────────────────────────────────────────────────────────────────

export const getReviews = async ({ page = 1, limit = 20 } = {}) => {
  const [reviews, total] = await prisma.$transaction([
    prisma.review.findMany({
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      include: {
        order: {
          select: {
            restaurantId: true,
            customer: { select: { name: true, email: true } },
            restaurant: { select: { name: true } },
          },
        },
      },
    }),
    prisma.review.count(),
  ]);
  return { reviews, total, page: Number(page), limit: Number(limit) };
};

export const deleteReview = async (id) => {
  await prisma.review.delete({ where: { id } });
};

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const getAuditLog = async ({ page = 1, limit = 50, userId, action } = {}) => {
  const where = {};
  if (userId) where.userId = userId;
  if (action) where.action = { contains: action, mode: "insensitive" };
  const [entries, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { entries, total, page: Number(page), limit: Number(limit) };
};

// ─── User management (admin) ──────────────────────────────────────────────────

const USER_SELECT = { id: true, name: true, email: true, phone: true, roles: true, activeRole: true, isBlocked: true, isSuspended: true };

export const updateUser = async (id, data) => {
  const update = {};
  if (data.name !== undefined) update.name = String(data.name).trim();
  if (data.phone !== undefined) update.phone = data.phone || null;
  return prisma.user.update({ where: { id }, data: update, select: USER_SELECT });
};

export const blockUser = async (id, { block }) => {
  const isBlocked = block === true || block === "true";
  return prisma.user.update({
    where: { id },
    data: { isBlocked },
    select: USER_SELECT,
  });
};

export const changeUserRole = async (id, { role }) => {
  const validRoles = ["CUSTOMER", "RESTAURANT", "DELIVERY", "ADMIN"];
  if (!validRoles.includes(role)) throw new AppError("Invalid role", 400);

  const user = await prisma.user.findUnique({ where: { id }, select: { roles: true } });
  if (!user) throw new AppError("User not found", 404);

  const roles = Array.from(new Set([...user.roles, role]));
  return prisma.user.update({
    where: { id },
    data: { roles, activeRole: role },
    select: USER_SELECT,
  });
};

export const grantRole = async (id, { role }) => {
  const validRoles = ["CUSTOMER", "RESTAURANT", "DELIVERY", "ADMIN"];
  if (!validRoles.includes(role)) throw new AppError("Invalid role", 400);
  const user = await prisma.user.findUnique({ where: { id }, select: { roles: true } });
  if (!user) throw new AppError("User not found", 404);
  const roles = Array.from(new Set([...user.roles, role]));
  return prisma.user.update({ where: { id }, data: { roles }, select: USER_SELECT });
};

export const revokeRole = async (id, { role }) => {
  if (role === "CUSTOMER") throw new AppError("Cannot revoke CUSTOMER role", 400);
  const user = await prisma.user.findUnique({ where: { id }, select: { roles: true, activeRole: true } });
  if (!user) throw new AppError("User not found", 404);
  const roles = user.roles.filter((r) => r !== role);
  const activeRole = roles.includes(user.activeRole) ? user.activeRole : (roles[0] ?? "CUSTOMER");
  return prisma.user.update({ where: { id }, data: { roles, activeRole }, select: USER_SELECT });
};

export const deleteUserById = async (id) => {
  await prisma.user.delete({ where: { id } });
};

export const suspendUser = async (id, { suspend }) => {
  const isSuspended = suspend === true || suspend === "true";
  return prisma.user.update({ where: { id }, data: { isSuspended }, select: USER_SELECT });
};
