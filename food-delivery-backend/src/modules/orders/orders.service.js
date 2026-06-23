import { prisma } from "../../config/prisma.js";
import { getSiteConfigCached } from "../config/config.service.js";
import { computeETA } from "../../utils/eta.js";
import { logger } from "../../utils/logger.js";

// All monetary values are in PAISE (₹50 = 5000).
const FALLBACK_DELIVERY_FEE = 3000; // ₹30 — used only if SiteConfig is unreadable

async function getDeliveryFee() {
  try {
    const cfg = await getSiteConfigCached();
    const fee = Number(cfg.defaultDeliveryFee);
    return Number.isFinite(fee) && fee >= 0 ? fee : FALLBACK_DELIVERY_FEE;
  } catch {
    return FALLBACK_DELIVERY_FEE;
  }
}

// Shared coupon validation — values in DB are paise. Throws on any failure.
function computeCouponDiscount(coupon, subtotal, restaurantId) {
  if (!coupon) throw new Error("Invalid coupon code");
  if (!coupon.isActive) throw new Error("Coupon is no longer active");
  if (new Date() > new Date(coupon.expiresAt)) throw new Error("Coupon has expired");
  if (coupon.usedCount >= coupon.maxUses) throw new Error("Coupon usage limit exceeded");
  if (coupon.restaurantId && coupon.restaurantId !== restaurantId) {
    throw new Error("Coupon is not valid for this restaurant");
  }
  if (subtotal < Number(coupon.minOrder)) {
    throw new Error(`Coupon requires minimum order of ₹${(Number(coupon.minOrder) / 100).toFixed(0)}`);
  }
  let discount = 0;
  if (coupon.discountType === "PERCENTAGE") {
    discount = Math.round(subtotal * (Number(coupon.discountValue) / 100));
  } else if (coupon.discountType === "FLAT") {
    discount = Math.round(Number(coupon.discountValue));
  }
  // Never discount below zero total
  return Math.min(discount, subtotal);
}

function serializeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    discount: Number(order.discount),
    total: Number(order.total),
    estimatedDelivery: order.estimatedDelivery?.toISOString() ?? null,
  };
}

export const listOrders = async (customerId, { page = 1, limit = 20 } = {}) => {
  const take = Math.min(Number(limit), 100);
  const skip = (Math.max(Number(page), 1) - 1) * take;
  const orders = await prisma.order.findMany({
    where: customerId ? { customerId } : undefined,
    include: {
      restaurant: true,
      agent: true,
    },
    orderBy: { placedAt: "desc" },
    take,
    skip,
  });

  return orders.map(serializeOrder);
};

export const getOrderById = async (orderId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: true,
      agent: true,
    },
  });

  return serializeOrder(order);
};

// Soft safety-net, not a full discovery-layer rewrite: only rejects when
// BOTH the restaurant's city and the delivery address's city are known and
// clearly different. Restaurant.city is a new field backfilled from the
// address JSON blob, so most rows may still have it unset — never reject
// on missing data, only on a confident mismatch.
function assertDeliveryCityMatches(restaurant, deliveryAddress) {
  const restaurantCity = (restaurant?.city || restaurant?.address?.city || "").toLowerCase().trim();
  const addressCity = (deliveryAddress?.city || "").toLowerCase().trim();
  if (restaurantCity && addressCity && restaurantCity !== addressCity) {
    throw new Error("Delivery address must be in the same city as the restaurant");
  }
}

export const createOrder = async (payload, customerId) => {
  // ============================================
  // SECURITY: Server-side calculation only
  // Ignore all client-provided price values
  // ============================================

  // 0. Verify restaurant exists and is accepting orders
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: payload.restaurantId },
    select: { isOpen: true, suspended: true, isApproved: true, city: true, address: true },
  });
  if (!restaurant) throw new Error("Restaurant not found");
  if (restaurant.suspended || !restaurant.isApproved) throw new Error("Restaurant not found");
  if (!restaurant.isOpen) throw new Error("Restaurant is not accepting orders right now");
  assertDeliveryCityMatches(restaurant, payload.deliveryAddress);

  // 1. Extract menuItemIds from request
  const menuItemIds = payload.items.map((item) => item.menuItemId);

  // 2. Fetch all menu items from DB
  const dbMenuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: menuItemIds },
      restaurantId: payload.restaurantId,
      isAvailable: true,
    },
  });

  // 3. Validate all items exist and belong to this restaurant
  if (dbMenuItems.length !== menuItemIds.length) {
    throw new Error("Invalid items: Some menu items not found or unavailable");
  }

  // 4. Calculate subtotal server-side
  let subtotal = 0;
  const itemsToStore = [];

  for (const requestItem of payload.items) {
    const dbItem = dbMenuItems.find((item) => item.id === requestItem.menuItemId);
    if (!dbItem) {
      throw new Error("Invalid items: Menu item not found");
    }

    const itemTotal = Number(dbItem.price) * requestItem.quantity;
    subtotal += itemTotal;

    // Build items JSON to store in order
    itemsToStore.push({
      menuItemId: dbItem.id,
      name: dbItem.name,
      price: Number(dbItem.price),
      quantity: requestItem.quantity,
      imageUrl: dbItem.imageUrl,
    });
  }

  // 5. Enforce admin settings: this endpoint is the cash-on-delivery path
  // (paid orders are created via /payments/verify after capture).
  const cfg = await getSiteConfigCached().catch(() => null);
  if (cfg && cfg.cashOnDelivery === false) {
    throw new Error("Cash on delivery is currently disabled");
  }
  if (cfg && subtotal < Number(cfg.codMinOrder || 0)) {
    throw new Error(`Cash on delivery requires a minimum order of ₹${(Number(cfg.codMinOrder) / 100).toFixed(0)}`);
  }

  const deliveryFee = await getDeliveryFee();
  const initialStatus = cfg?.autoConfirmOrders ? "CONFIRMED" : "PLACED";

  // 6-8. Create order in transaction with coupon validation inside (atomicity)
  const order = await prisma.$transaction(async (tx) => {
    let discount = 0;

    if (payload.couponCode) {
      const coupon = await tx.coupon.findUnique({
        where: { code: payload.couponCode.toUpperCase() },
      });
      discount = computeCouponDiscount(coupon, subtotal, payload.restaurantId);

      // Guarded increment — the WHERE clause re-checks the usage limit so two
      // concurrent orders cannot both consume the last redemption.
      const claimed = await tx.coupon.updateMany({
        where: { id: coupon.id, usedCount: { lt: coupon.maxUses } },
        data: { usedCount: { increment: 1 } },
      });
      if (claimed.count === 0) {
        throw new Error("Coupon usage limit exceeded");
      }
    }

    const finalTotal = Math.max(subtotal + deliveryFee - discount, 0);

    // Create order with server-calculated values only
    return tx.order.create({
      data: {
        customerId,
        restaurantId: payload.restaurantId,
        agentId: null,
        status: initialStatus,
        items: itemsToStore,
        subtotal,
        deliveryFee,
        discount,
        total: finalTotal,
        deliveryAddress: payload.deliveryAddress,
      },
      include: {
        restaurant: true,
        agent: true,
      },
    });
  });

  return serializeOrder(order);
};

export const updateOrderStatus = async ({ orderId, status, agentId, estimatedDelivery }) => {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      ...(agentId ? { agentId } : {}),
      ...(estimatedDelivery ? { estimatedDelivery } : {}),
      ...(status === "DELIVERED" ? { deliveredAt: new Date() } : {}),
    },
    include: {
      restaurant: true,
      agent: true,
    },
  });

  return serializeOrder(order);
};

export const updateAgentAvailability = async (agentId, isAvailable, coords) => {
  return prisma.user.update({
    where: { id: agentId },
    data: {
      isAvailable,
      ...(coords
        ? { currentLat: coords.lat, currentLng: coords.lng }
        : {}),
    },
  });
};

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const assignDeliveryAgent = async (orderId, io) => {
  logger.info("Assigning agent for order — started", { orderId });

  // 1. Fetch the order with restaurant location
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { restaurant: true },
  });

  if (!order) {
    logger.warn("Assigning agent for order — order not found", { orderId });
    return null;
  }

  // 2. Find available DELIVERY role users who are online (isAvailable: true)
  // and have a current location set.
  // NOTE: User model has roles[] (array), not a scalar `role` — querying
  // `role:` threw a Prisma validation error and broke auto-assignment entirely.
  const availableAgents = await prisma.user.findMany({
    where: {
      roles: { has: "DELIVERY" },
      isAvailable: true,
      isBlocked: false,
      isSuspended: false,
      currentLat: { not: null },
      currentLng: { not: null },
    },
  });

  logger.info("Assigning agent for order", { orderId, availableCount: availableAgents.length });

  if (availableAgents.length === 0) {
    io.to("admin").emit("order:no-agent", {
      orderId,
      restaurantName: order.restaurant.name,
      reason: "no_agents_at_all",
    });
    return null;
  }

  // 3. City filter — never match cross-city. Falls back to the full
  // citywide-unaware pool when city data is unavailable (most riders/
  // restaurants haven't set one yet, since this is a new field) so this
  // never regresses to "nobody gets assigned" the way Bug 2 just did.
  const restaurantCity = (order.restaurant.city || order.restaurant.address?.city || "")
    .toLowerCase().trim();

  let candidatePool = availableAgents;
  if (restaurantCity) {
    const cityMatched = availableAgents.filter(
      (agent) => (agent.city || "").toLowerCase().trim() === restaurantCity
    );
    if (cityMatched.length > 0) {
      candidatePool = cityMatched;
      logger.info("Assigning agent for order — city match", { orderId, city: restaurantCity, count: cityMatched.length });
    } else {
      logger.warn("Assigning agent for order — no city match, falling back to full pool", {
        orderId, city: restaurantCity, fullPoolCount: availableAgents.length,
      });
    }
  }

  // 4. Radius filter — each rider has their own max radius (default 20km).
  // Unlike the city filter, this is NOT a soft fallback: maxRadiusKm has
  // always defaulted to a generous value for every rider, so an empty
  // result here means a genuine "nobody is close enough", not missing data.
  //
  // EXCEPTION: if the restaurant has no real lat/lng on file (never
  // geocoded), there is nothing to measure distance against. The old
  // fallback silently substituted central-Delhi coordinates here, which
  // produced a ~27km "distance" against riders who were actually at the
  // restaurant's real location and wrongly rejected the only available
  // agent. Skip the radius filter entirely in that case instead of
  // measuring against a made-up point — same "don't invent data" pattern
  // as the city filter above.
  const restaurantHasCoords = order.restaurant.lat != null && order.restaurant.lng != null;
  const restaurantLat = order.restaurant.lat ?? 28.6139;
  const restaurantLng = order.restaurant.lng ?? 77.2090;

  const inRangeAgents = candidatePool
    .map((agent) => ({
      ...agent,
      distance: haversine(restaurantLat, restaurantLng, agent.currentLat, agent.currentLng),
    }))
    .filter((agent) => {
      // maxRadiusKm is NOT NULL DEFAULT 20 in schema, but guard against any
      // accidental 0/negative/NaN value getting through anyway rather than
      // silently rejecting every agent for that rider.
      const radius = Number.isFinite(agent.maxRadiusKm) && agent.maxRadiusKm > 0 ? agent.maxRadiusKm : 20;
      logger.info("Assigning agent for order — computed distance", {
        orderId, agentId: agent.id, distanceKm: Math.round(agent.distance * 10) / 10, radiusKm: radius,
        restaurantHasCoords,
      });
      return !restaurantHasCoords || agent.distance <= radius;
    })
    .sort((a, b) => a.distance - b.distance);

  if (inRangeAgents.length === 0) {
    logger.warn("Assigning agent for order — no agents within radius", { orderId, city: restaurantCity || null });
    io.to("admin").emit("order:no-agent", {
      orderId,
      restaurantName: order.restaurant.name,
      reason: "no_agents_in_radius",
      city: restaurantCity || null,
    });
    return null;
  }

  const selectedAgent = inRangeAgents[0];

  // 4. Update order with agent, compute ETA, set agent as unavailable
  const estimatedDelivery = computeETA(order.restaurant, selectedAgent, "OUT_FOR_DELIVERY", order.deliveryAddress);

  const [updatedOrder] = await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { agentId: selectedAgent.id, estimatedDelivery },
      include: { restaurant: true, agent: true },
    }),
    prisma.user.update({
      where: { id: selectedAgent.id },
      data: { isAvailable: false },
    }),
  ]);

  logger.info("Agent assigned", { orderId, agentId: selectedAgent.id });

  // 5. Emit to agent: full order details for their assignment modal
  logger.info("Emitting order:assigned to room", { room: `agent-${selectedAgent.id}` });
  io.to(`agent-${selectedAgent.id}`).emit("order:assigned", {
    orderId,
    orderNumber: orderId.slice(-6).toUpperCase(),
    pickup: {
      name: order.restaurant.name,
      address: order.restaurant.address,
      lat: restaurantLat,
      lng: restaurantLng,
    },
    dropoff: {
      address: order.deliveryAddress,
    },
    items: order.items,
    estimatedEarnings: Math.round(40 + selectedAgent.distance * 5), // ₹40 base + ₹5/km
  });

  // 6. Emit to customer and shop: agent is assigned
  io.to(`order-${orderId}`).emit("agent:assigned", {
    agent: {
      id: selectedAgent.id,
      name: selectedAgent.name,
      phone: selectedAgent.phone,
      rating: 4.5,
    },
    estimatedDelivery: estimatedDelivery.toISOString(),
  });
  io.to(`shop-${order.restaurantId}`).emit("agent:assigned", {
    orderId,
    agentName: selectedAgent.name,
  });
  io.to("admin").emit("agent:assigned", { orderId, agentId: selectedAgent.id });

  return selectedAgent;
};

export const calculateOrderTotal = async ({ restaurantId, items, couponCode, deliveryAddress }) => {
  if (deliveryAddress) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { city: true, address: true },
    });
    if (restaurant) assertDeliveryCityMatches(restaurant, deliveryAddress);
  }

  // 1. Extract menuItemIds from request
  const menuItemIds = items.map((item) => item.menuItemId);

  // 2. Fetch all menu items from DB
  const dbMenuItems = await prisma.menuItem.findMany({
    where: {
      id: { in: menuItemIds },
      restaurantId,
      isAvailable: true,
    },
  });

  // 3. Validate all items exist and belong to this restaurant
  if (dbMenuItems.length !== menuItemIds.length) {
    throw new Error("Invalid items: Some menu items not found or unavailable");
  }

  // 4. Calculate subtotal server-side
  let subtotal = 0;
  const orderItems = [];

  for (const requestItem of items) {
    const dbItem = dbMenuItems.find((item) => item.id === requestItem.menuItemId);
    if (!dbItem) {
      throw new Error("Invalid items: Menu item not found");
    }

    const itemTotal = Number(dbItem.price) * requestItem.quantity;
    subtotal += itemTotal;

    // Build items JSON to store in order
    orderItems.push({
      menuItemId: dbItem.id,
      name: dbItem.name,
      price: Number(dbItem.price),
      quantity: requestItem.quantity,
      imageUrl: dbItem.imageUrl,
    });
  }

  // 5. Delivery fee from admin-configured SiteConfig (paise)
  const deliveryFee = await getDeliveryFee();

  // 6. Validate and apply coupon if provided
  let discount = 0;
  let couponId = null;

  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: couponCode.toUpperCase() },
    });
    discount = computeCouponDiscount(coupon, subtotal, restaurantId);
    couponId = coupon.id;
  }

  // 7. Calculate total = subtotal + deliveryFee - discount
  const total = Math.max(subtotal + deliveryFee - discount, 0);

  return { orderItems, subtotal, deliveryFee, discount, total, couponId };
};
