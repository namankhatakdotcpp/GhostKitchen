import { prisma } from "../../config/prisma.js";
import { logger } from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import { emitOrderStatusUpdated } from "../../socket/socket.server.js";
import { computeETA } from "../../utils/eta.js";
import { getRiderStatus } from "../../utils/riderStatus.js";

// Order statuses that represent an in-flight delivery a rider is actively working.
const ACTIVE_DELIVERY_STATUSES = ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"];

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
      take: 500, // hard cap — an unbounded scan here OOMs once order volume grows
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
  const status = newStatus.toUpperCase();

  if (!validStatuses.includes(status)) {
    throw new AppError(`Invalid status: ${newStatus}`, 400);
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: { select: { lat: true, lng: true, address: true } },
      agent: { select: { currentLat: true, currentLng: true } },
    },
  });
  if (!order) throw new AppError("Order not found", 404);

  const terminalStatuses = ["DELIVERED", "CANCELLED"];
  const etaStatuses = ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"];
  const estimatedDelivery = etaStatuses.includes(status) && !terminalStatuses.includes(order.status)
    ? computeETA(order.restaurant, order.agent, status, order.deliveryAddress)
    : order.estimatedDelivery;

  const updateData = {
    status,
    ...(estimatedDelivery ? { estimatedDelivery } : {}),
    ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
  };

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: updateData,
    include: ORDER_INCLUDE,
  });

  emitOrderStatusUpdated({
    orderId,
    status,
    estimatedDelivery: estimatedDelivery?.toISOString() ?? null,
    timestamp: new Date().toISOString(),
  });

  logger.warn("Admin updated order status", { orderId, oldStatus: order.status, newStatus: status, reason });
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

  emitOrderStatusUpdated({ orderId, status: "CANCELLED", estimatedDelivery: null, timestamp: new Date().toISOString() });

  logger.warn("Admin cancelled order", { orderId, reason });
  return cancelledOrder;
};

export const getAnalytics = async ({ days = 7 } = {}) => {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (Number(days) - 1));
  startDate.setHours(0, 0, 0, 0);

  const [allOrders, topRestaurantsRaw] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: startDate } },
      select: {
        id: true, status: true, total: true, createdAt: true,
        restaurantId: true,
        restaurant: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.groupBy({
      by: ["restaurantId"],
      where: { status: "DELIVERED", createdAt: { gte: startDate } },
      _sum: { total: true },
      _count: { id: true },
      orderBy: { _sum: { total: "desc" } },
      take: 5,
    }),
  ]);

  // Build per-day buckets
  const dayMap = new Map();
  for (let i = 0; i < Number(days); i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { date: key, orders: 0, revenue: 0 });
  }
  for (const o of allOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const bucket = dayMap.get(key);
    if (!bucket) continue;
    bucket.orders++;
    if (o.status === "DELIVERED") bucket.revenue += Number(o.total);
  }

  const trend = Array.from(dayMap.values());

  // Status breakdown for the window
  const statusBreakdown = {};
  for (const o of allOrders) {
    statusBreakdown[o.status] = (statusBreakdown[o.status] ?? 0) + 1;
  }

  // Enrich top restaurants
  const restaurantIds = topRestaurantsRaw.map((r) => r.restaurantId);
  const restaurants = await prisma.restaurant.findMany({
    where: { id: { in: restaurantIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(restaurants.map((r) => [r.id, r.name]));
  const topRestaurants = topRestaurantsRaw.map((r) => ({
    restaurantId: r.restaurantId,
    name: nameById.get(r.restaurantId) ?? "Unknown",
    revenue: Number(r._sum.total ?? 0),
    orders: r._count.id,
  }));

  const totalRevenue = allOrders
    .filter((o) => o.status === "DELIVERED")
    .reduce((s, o) => s + Number(o.total), 0);
  const totalOrders = allOrders.length;
  const deliveredOrders = allOrders.filter((o) => o.status === "DELIVERED").length;

  return {
    trend,
    statusBreakdown,
    topRestaurants,
    summary: { totalOrders, deliveredOrders, totalRevenue, days: Number(days) },
  };
};

export const getDeliveryAgents = async ({ page = 1, limit = 20, search, onlineOnly = false } = {}) => {
  const where = {
    roles: { has: "DELIVERY" },
  };
  if (onlineOnly === true || onlineOnly === "true") where.isAvailable = true;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const [agents, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      skip: (page - 1) * limit,
      take: Number(limit),
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, phone: true,
        isAvailable: true, isOnDuty: true, isBlocked: true, isSuspended: true,
        vehicleType: true, vehicleNumber: true,
        currentLat: true, currentLng: true,
        createdAt: true,
        _count: { select: { agentOrders: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // Attach delivered order count per agent
  const agentIds = agents.map((a) => a.id);
  const deliveredCounts = await prisma.order.groupBy({
    by: ["agentId"],
    where: { agentId: { in: agentIds }, status: "DELIVERED" },
    _count: { id: true },
  });
  const deliveredMap = new Map(deliveredCounts.map((d) => [d.agentId, d._count.id]));

  return {
    agents: agents.map((a) => ({
      ...a,
      totalOrders: a._count.agentOrders,
      deliveredOrders: deliveredMap.get(a.id) ?? 0,
    })),
    total,
    page: Number(page),
    limit: Number(limit),
  };
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
  // Batched enrichment — the per-payment lookups were 3 queries × page size
  const [customers, restaurants, orders] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...new Set(payments.map((p) => p.customerId))] } },
      select: { id: true, name: true },
    }),
    prisma.restaurant.findMany({
      where: { id: { in: [...new Set(payments.map((p) => p.restaurantId))] } },
      select: { id: true, name: true },
    }),
    prisma.order.findMany({
      where: { cfOrderId: { in: payments.map((p) => p.cfOrderId) } },
      select: { id: true, cfOrderId: true },
    }),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c.name]));
  const restaurantById = new Map(restaurants.map((r) => [r.id, r.name]));
  const orderByCfId = new Map(orders.map((o) => [o.cfOrderId, o.id]));

  const enriched = payments.map((p) => ({
    ...p,
    customerName: customerById.get(p.customerId),
    restaurantName: restaurantById.get(p.restaurantId),
    orderId: orderByCfId.get(p.cfOrderId),
  }));
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
    include: { owner: { select: { email: true, name: true } } },
  });
};

export const assignDeliveryPartner = async (orderId, agentId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { restaurant: { select: { lat: true, lng: true, address: true } } },
  });
  if (!order) throw new AppError("Order not found", 404);

  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { currentLat: true, currentLng: true },
  });

  const estimatedDelivery = computeETA(order.restaurant, agent, "OUT_FOR_DELIVERY", order.deliveryAddress);

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { agentId, status: "OUT_FOR_DELIVERY", estimatedDelivery },
    include: ORDER_INCLUDE,
  });

  emitOrderStatusUpdated({
    orderId,
    status: "OUT_FOR_DELIVERY",
    estimatedDelivery: estimatedDelivery.toISOString(),
    timestamp: new Date().toISOString(),
  });

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
  const user = await prisma.user.update({
    where: { id },
    data: { isBlocked },
    select: USER_SELECT,
  });
  // Revoke all sessions so the block takes effect immediately, not after token expiry
  if (isBlocked) await prisma.refreshToken.deleteMany({ where: { userId: id } });
  return user;
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
  const user = await prisma.user.findUnique({ where: { id }, select: { roles: true, activeRole: true } });
  if (!user) throw new AppError("User not found", 404);
  const isNewRole = !user.roles.includes(role);
  const roles = Array.from(new Set([...user.roles, role]));
  const data = { roles };
  // Only promote activeRole on a *new* grant and only when the user is currently
  // operating as CUSTOMER — so granting ADMIN/DELIVERY sets them as the active
  // role on next login rather than leaving them stuck on CUSTOMER.
  if (isNewRole && role !== "CUSTOMER" && user.activeRole === "CUSTOMER") {
    data.activeRole = role;
  }
  return prisma.user.update({ where: { id }, data, select: USER_SELECT });
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
  const user = await prisma.user.update({ where: { id }, data: { isSuspended }, select: USER_SELECT });
  if (isSuspended) await prisma.refreshToken.deleteMany({ where: { userId: id } });
  return user;
};

// ─── Restaurant management ─────────────────────────────────────────────────────

export const deleteRestaurantById = async (id) => {
  await prisma.restaurant.delete({ where: { id } });
};

// ─── Audit log export ─────────────────────────────────────────────────────────

export const getAuditLogAll = async ({ userId, action } = {}) => {
  const where = {};
  if (userId) where.userId = userId;
  if (action) where.action = { contains: action, mode: "insensitive" };
  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10000, // hard cap to avoid OOM
  });
};

function escapeCsv(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const auditLogToCsv = (entries) => {
  const headers = ["id", "userId", "action", "entityType", "entityId", "ipAddress", "createdAt"];
  const rows = entries.map((e) =>
    headers.map((h) => escapeCsv(h === "createdAt" ? e[h]?.toISOString() : e[h])).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
};

// ── Live Operations Map ───────────────────────────────────────────────────────
// Single snapshot powering /api/admin/live-map: restaurants, riders (with live
// presence + active load), and in-flight deliveries. All counts are computed
// with groupBy aggregations (no per-row queries) so it scales to hundreds of
// restaurants and thousands of riders without N+1 fan-out.
export const getLiveMapData = async () => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [restaurants, riderLocations, deliveringOrders] = await Promise.all([
    prisma.restaurant.findMany({
      where: { lat: { not: null }, lng: { not: null } },
      select: { id: true, name: true, lat: true, lng: true, rating: true, isOpen: true, suspended: true },
    }),
    prisma.riderLocation.findMany({
      where: { rider: { roles: { has: "DELIVERY" } } },
      select: {
        riderId: true, latitude: true, longitude: true, heading: true, speed: true, lastSeenAt: true,
        rider: { select: { id: true, name: true } },
      },
    }),
    prisma.order.findMany({
      where: { status: "OUT_FOR_DELIVERY" },
      select: {
        id: true, status: true, total: true, createdAt: true,
        estimatedDelivery: true, deliveryAddress: true,
        restaurant: { select: { id: true, name: true, lat: true, lng: true } },
        customer: { select: { id: true, name: true, phone: true } },
        agent: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const restaurantIds = restaurants.map((r) => r.id);
  const riderIds = riderLocations.map((l) => l.riderId);

  const [activeByRestaurant, todayByRestaurant, activeByRider] = await Promise.all([
    restaurantIds.length
      ? prisma.order.groupBy({
          by: ["restaurantId"],
          where: { restaurantId: { in: restaurantIds }, status: { in: ACTIVE_DELIVERY_STATUSES } },
          _count: { id: true },
        })
      : [],
    restaurantIds.length
      ? prisma.order.groupBy({
          by: ["restaurantId"],
          where: { restaurantId: { in: restaurantIds }, createdAt: { gte: startOfToday } },
          _count: { id: true },
        })
      : [],
    riderIds.length
      ? prisma.order.groupBy({
          by: ["agentId"],
          where: { agentId: { in: riderIds }, status: { in: ACTIVE_DELIVERY_STATUSES } },
          _count: { id: true },
        })
      : [],
  ]);

  const activeRestMap = new Map(activeByRestaurant.map((r) => [r.restaurantId, r._count.id]));
  const todayRestMap = new Map(todayByRestaurant.map((r) => [r.restaurantId, r._count.id]));
  const activeRiderMap = new Map(activeByRider.map((r) => [r.agentId, r._count.id]));
  const riderCoordMap = new Map(riderLocations.map((l) => [l.riderId, { latitude: l.latitude, longitude: l.longitude }]));

  return {
    restaurants: restaurants.map((r) => ({
      id: r.id,
      name: r.name,
      latitude: r.lat,
      longitude: r.lng,
      rating: r.rating,
      status: r.suspended ? "SUSPENDED" : r.isOpen ? "OPEN" : "CLOSED",
      activeOrders: activeRestMap.get(r.id) ?? 0,
      todaysOrders: todayRestMap.get(r.id) ?? 0,
    })),
    riders: riderLocations.map((l) => ({
      id: l.riderId,
      name: l.rider?.name ?? "Rider",
      status: getRiderStatus(l.lastSeenAt),
      latitude: l.latitude,
      longitude: l.longitude,
      heading: l.heading,
      speed: l.speed,
      lastSeenAt: l.lastSeenAt,
      activeDeliveries: activeRiderMap.get(l.riderId) ?? 0,
    })),
    activeOrders: deliveringOrders.map((o) => {
      // Customer drop-off coordinates live on the deliveryAddress JSON (lat/lng).
      const drop = o.deliveryAddress && typeof o.deliveryAddress === "object" ? o.deliveryAddress : null;
      const dropLat = typeof drop?.lat === "number" ? drop.lat : null;
      const dropLng = typeof drop?.lng === "number" ? drop.lng : null;
      return {
        id: o.id,
        orderNumber: o.id.slice(-6).toUpperCase(),
        status: o.status,
        total: o.total,
        estimatedDelivery: o.estimatedDelivery,
        restaurant: o.restaurant
          ? { id: o.restaurant.id, name: o.restaurant.name, latitude: o.restaurant.lat, longitude: o.restaurant.lng }
          : null,
        customer: o.customer
          ? { id: o.customer.id, name: o.customer.name, latitude: dropLat, longitude: dropLng }
          : null,
        rider: o.agent
          ? {
              id: o.agent.id,
              name: o.agent.name,
              latitude: riderCoordMap.get(o.agent.id)?.latitude ?? null,
              longitude: riderCoordMap.get(o.agent.id)?.longitude ?? null,
            }
          : null,
      };
    }),
  };
};
