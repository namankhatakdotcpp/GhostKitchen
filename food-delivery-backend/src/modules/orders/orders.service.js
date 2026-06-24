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

// Formats an address-like JSON blob (Restaurant.address / Order.deliveryAddress
// — line1/city/etc.) into a single display string for socket payloads that
// need a string, not a nested object.
function formatAddress(address) {
  if (!address || typeof address !== "object") return "";
  return [address.line1, address.city].filter(Boolean).join(", ");
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
  //
  // EXCEPTION: a restaurant with no real lat/lng on file (never geocoded)
  // must NOT fall back to the full, citywide-unaware pool — there is no
  // real distance to check it against (see restaurantHasCoords below), so
  // a "fallback" here means assigning a rider an unknown, possibly huge,
  // distance away with zero ability to detect it. Restrict an ungeocoded
  // restaurant to city-matched riders only; if there's no city match
  // either, leave the order unassigned for this pass rather than guess.
  const restaurantCity = (order.restaurant.city || order.restaurant.address?.city || "")
    .toLowerCase().trim();
  const restaurantHasCoords = order.restaurant.lat != null && order.restaurant.lng != null;

  const cityMatched = restaurantCity
    ? availableAgents.filter((agent) => (agent.city || "").toLowerCase().trim() === restaurantCity)
    : [];

  let candidatePool;
  if (cityMatched.length > 0) {
    candidatePool = cityMatched;
    logger.info("Assigning agent for order — city match", { orderId, city: restaurantCity, count: cityMatched.length });
  } else if (restaurantHasCoords) {
    candidatePool = availableAgents;
    logger.warn("Assigning agent for order — no city match, falling back to full pool", {
      orderId, city: restaurantCity || null, fullPoolCount: availableAgents.length,
    });
  } else {
    candidatePool = [];
    logger.warn("Assigning agent for order — restaurant not geocoded and no city match, refusing blind full-pool fallback", {
      orderId, city: restaurantCity || null,
    });
  }

  // 4. Radius filter — each rider has their own max radius (default 20km).
  // This is NOT a soft fallback: maxRadiusKm has always defaulted to a
  // generous value for every rider, so an empty result here means a
  // genuine "nobody is close enough", not missing data. Restaurants with no
  // coordinates never reach this filter with a non-empty candidatePool (see
  // above), so there is no made-up-distance case to special-case here.
  const restaurantLat = order.restaurant.lat;
  const restaurantLng = order.restaurant.lng;

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
      return agent.distance <= radius;
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

  // 4. Offer the order to the selected rider — do NOT write agentId yet.
  // pendingAgentId/agentOfferedAt record "offer sent, awaiting response";
  // agentId is only ever written by the accept endpoint once the rider
  // really accepts. Mark the rider unavailable while their offer is live so
  // they can't be double-offered a second order in the same window.
  const [updatedOrder] = await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { pendingAgentId: selectedAgent.id, agentOfferedAt: new Date() },
      include: { restaurant: true, agent: true },
    }),
    prisma.user.update({
      where: { id: selectedAgent.id },
      data: { isAvailable: false },
    }),
  ]);

  logger.info("Agent offered order", { orderId, agentId: selectedAgent.id });

  // 5. Emit to agent: full order details for their offer modal. Customer and
  // shop are NOT notified yet — order:assigned only fires after real
  // acceptance, via the /accept endpoint below.
  //
  // distanceKm/restaurantName/pickupAddress/dropoffAddress are included as
  // flat, already-formatted fields (not just nested under pickup/dropoff)
  // because the rider's offer modal (DeliveryAssignment type, delivery-shell.tsx)
  // reads them directly off the top-level payload — e.g.
  // incomingAssignment.distanceKm.toFixed(1). Omitting distanceKm here is
  // exactly what crashed that modal with "Cannot read properties of
  // undefined (reading 'toFixed')" on every single offer, since the field
  // never existed on the payload at all.
  logger.info("Emitting order:offer to room", { room: `agent-${selectedAgent.id}` });
  io.to(`agent-${selectedAgent.id}`).emit("order:offer", {
    orderId,
    orderNumber: orderId.slice(-6).toUpperCase(),
    expiresInSeconds: 30,
    restaurantName: order.restaurant.name,
    pickupAddress: formatAddress(order.restaurant.address),
    dropoffAddress: formatAddress(order.deliveryAddress),
    distanceKm: Math.round(selectedAgent.distance * 10) / 10,
    pickup: {
      name: order.restaurant.name,
      address: order.restaurant.address,
      lat: restaurantLat,
      lng: restaurantLng,
    },
    dropoff: {
      address: order.deliveryAddress,
    },
    pickupLat: restaurantLat,
    pickupLng: restaurantLng,
    items: order.items,
    estimatedEarnings: Math.round(40 + selectedAgent.distance * 5), // ₹40 base + ₹5/km
  });

  return selectedAgent;
};

// POST /api/delivery/orders/:orderId/accept
// Only the rider who was actually offered this order can accept it. The
// WHERE clause's `pendingAgentId: agentId` guard makes the claim atomic —
// if two requests somehow race (e.g. a retry double-fires), only the first
// updateMany matches and flips pendingAgentId away, so the second is a no-op.
export const acceptOrderOffer = async (orderId, agentId, io) => {
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, pendingAgentId: agentId },
    data: { agentId, pendingAgentId: null, agentOfferedAt: null },
  });

  if (claimed.count === 0) {
    return { ok: false, reason: "Offer no longer available" };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { restaurant: true, agent: true },
  });

  const estimatedDelivery = computeETA(order.restaurant, order.agent, "OUT_FOR_DELIVERY", order.deliveryAddress);
  await prisma.order.update({ where: { id: orderId }, data: { estimatedDelivery } });

  logger.info("Agent accepted offer — order assigned", { orderId, agentId });

  // order:assigned now only fires here, post-acceptance — this used to fire
  // unilaterally the moment assignDeliveryAgent ran, before the rider had
  // agreed to anything.
  io.to(`order-${orderId}`).emit("agent:assigned", {
    agent: { id: order.agent.id, name: order.agent.name, phone: order.agent.phone, rating: 4.5 },
    estimatedDelivery: estimatedDelivery.toISOString(),
  });
  io.to(`shop-${order.restaurantId}`).emit("agent:assigned", {
    orderId,
    agentName: order.agent.name,
  });
  io.to("admin").emit("agent:assigned", { orderId, agentId });

  return { ok: true, order: { ...serializeOrder(order), estimatedDelivery: estimatedDelivery.toISOString() } };
};

// POST /api/delivery/orders/:orderId/reject
// Frees the rider, clears the offer, and immediately tries the next
// available rider. If nobody else is available, the 2-minute reassignment
// job (jobs/agentReassignment.job.js) picks it up as a fallback.
export const rejectOrderOffer = async (orderId, agentId, io) => {
  const cleared = await prisma.order.updateMany({
    where: { id: orderId, pendingAgentId: agentId },
    data: { pendingAgentId: null, agentOfferedAt: null },
  });

  if (cleared.count === 0) {
    return { ok: false, reason: "Offer no longer available" };
  }

  await prisma.user.update({ where: { id: agentId }, data: { isAvailable: true } });

  logger.info("Agent rejected offer — re-offering", { orderId, agentId });
  const nextAgent = await assignDeliveryAgent(orderId, io);
  return { ok: true, reassigned: !!nextAgent };
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
