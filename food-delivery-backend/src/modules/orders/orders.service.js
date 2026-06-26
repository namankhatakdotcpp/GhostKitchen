import { prisma } from "../../config/prisma.js";
import { getSiteConfigCached } from "../config/config.service.js";
import { getPlatformSettingsCached, snapshotSettings } from "../pricing/platformSettings.service.js";
import { computeOrderPricing } from "./pricing.js";
import { computeETA } from "../../utils/eta.js";
import { haversine } from "../../utils/geo.js";
import { logger } from "../../utils/logger.js";
import { emitOrderStatusUpdated } from "../../socket/socket.server.js";
import { createNotification } from "../notification/notification.service.js";
import { claimPointsInTx } from "../wallet/wallet.service.js";

// All monetary values are in PAISE (₹50 = 5000).

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

// Pricing breakdown fields are nullable in the schema (orders placed before
// this feature shipped have none) — coerce to Number only when present so
// old orders serialize as `null`, not `NaN`/`0`-looking-like-real-data.
const numOrNull = (v) => (v == null ? null : Number(v));

function serializeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    discount: Number(order.discount),
    total: Number(order.total),
    itemTotal: numOrNull(order.itemTotal),
    restaurantPackaging: numOrNull(order.restaurantPackaging),
    gstOnItemTotal: numOrNull(order.gstOnItemTotal),
    gstOnDeliveryFee: numOrNull(order.gstOnDeliveryFee),
    platformFee: numOrNull(order.platformFee),
    gstOnPlatformFee: numOrNull(order.gstOnPlatformFee),
    distanceKm: numOrNull(order.distanceKm),
    restaurantPayout: numOrNull(order.restaurantPayout),
    riderPayout: numOrNull(order.riderPayout),
    adminRevenue: numOrNull(order.adminRevenue),
    estimatedDelivery: order.estimatedDelivery?.toISOString() ?? null,
    // Lifecycle timestamps — used by the customer tracking timeline to show
    // accurate per-stage times instead of the current time.
    placedAt: order.placedAt?.toISOString() ?? null,
    acceptedAt: order.acceptedAt?.toISOString() ?? null,
    readyAt: order.readyAt?.toISOString() ?? null,
    pickedUpAt: order.pickedUpAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
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
    select: { isOpen: true, suspended: true, isApproved: true, city: true, address: true, lat: true, lng: true },
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

    const lineTotal = Number(dbItem.price) * requestItem.quantity;
    subtotal += lineTotal;

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

  const initialStatus = cfg?.autoConfirmOrders ? "CONFIRMED" : "PLACED";

  // 5b. Full pricing breakdown (item total, packaging, GST, delivery fee,
  // platform fee, 3-way split) — settings and distance are both resolved
  // here, before the transaction, since they're pure reads. Discount is
  // applied afterward, against the formula's customerTotal, inside the
  // transaction below (it needs the coupon's atomic-claim check).
  const pricing = await priceOrder({
    itemTotal: subtotal,
    restaurant,
    deliveryAddress: payload.deliveryAddress,
  });

  // Loyalty points redemption — fetched once, outside the transaction, since
  // it only affects the cap calculation and the guarded claim below re-checks
  // the real balance atomically anyway.
  const loyaltySettings = payload.pointsToRedeem ? await getPlatformSettingsCached() : null;

  // 6-8. Create order in transaction with coupon + points redemption validated inside (atomicity)
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

    // Coupon discount comes off what the customer pays, not off the
    // restaurant/rider/admin payouts — those are computed from the gross
    // fees pool above, unaffected by a marketing discount funded by the
    // platform's own margin. The formula doesn't address coupons at all;
    // this mirrors the pre-existing `subtotal + deliveryFee - discount`
    // behavior (discount only ever reduced the customer-facing total).
    const afterCoupon = Math.max(pricing.customerTotal - discount, 0);

    // Points redemption stacks on top of the coupon discount, off the same
    // customer-facing total — capped (not rejected) at the lesser of the
    // wallet's real balance and the admin-configured % of order value, so
    // points alone can never zero out an order. The wallet balance is read
    // inside this transaction and the decrement below is guarded
    // (balance >= points in the WHERE), so two concurrent checkouts from the
    // same wallet can never both spend the same points.
    let pointsRedeemed = 0;
    let pointsDiscount = 0;
    if (payload.pointsToRedeem > 0 && loyaltySettings) {
      const wallet = await tx.wallet.upsert({ where: { userId: customerId }, create: { userId: customerId }, update: {} });
      const maxByCapPaise = Math.floor((afterCoupon * loyaltySettings.loyaltyRedemptionCapPct) / 100);
      const maxByCapPoints = Math.floor(maxByCapPaise / loyaltySettings.loyaltyPointValuePaise);
      pointsRedeemed = Math.min(payload.pointsToRedeem, wallet.balance, maxByCapPoints);
      pointsDiscount = pointsRedeemed * loyaltySettings.loyaltyPointValuePaise;
    }
    const finalTotal = Math.max(afterCoupon - pointsDiscount, 0);

    // Create order with server-calculated values only
    const created = await tx.order.create({
      data: {
        customerId,
        restaurantId: payload.restaurantId,
        agentId: null,
        status: initialStatus,
        items: itemsToStore,
        subtotal,
        deliveryFee: pricing.deliveryFee,
        discount: discount + pointsDiscount,
        total: finalTotal,
        deliveryAddress: payload.deliveryAddress,
        itemTotal: pricing.itemTotal,
        restaurantPackaging: pricing.restaurantPackaging,
        gstOnItemTotal: pricing.gstOnItemTotal,
        gstOnDeliveryFee: pricing.gstOnDeliveryFee,
        platformFee: pricing.platformFee,
        gstOnPlatformFee: pricing.gstOnPlatformFee,
        distanceKm: pricing.distanceKm,
        restaurantPayout: pricing.restaurantPayout,
        riderPayout: pricing.riderPayout,
        adminRevenue: pricing.adminRevenue,
        pricingSnapshot: pricing.pricingSnapshot,
      },
      include: {
        restaurant: true,
        agent: true,
      },
    });

    if (pointsRedeemed > 0) {
      await claimPointsInTx(tx, customerId, pointsRedeemed, {
        orderId: created.id,
        description: `Redeemed at checkout on order #${created.id.slice(-6).toUpperCase()}`,
      });
    }

    return created;
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
      ...(status === "CONFIRMED"        ? { acceptedAt: new Date() } : {}),
      ...(status === "PREPARING"        ? { readyAt: new Date() } : {}),
      ...(status === "OUT_FOR_DELIVERY" ? { pickedUpAt: new Date() } : {}),
      ...(status === "DELIVERED"        ? { deliveredAt: new Date() } : {}),
    },
    include: {
      restaurant: true,
      agent: true,
    },
  });

  return serializeOrder(order);
};

// Single source of truth for cancelling an order with its full side-effect
// chain (socket push, customer + rider notification, auto-refund for paid
// orders) — used by both the manual Cancel/Reject button (orders.controller.js)
// and the auto-reject housekeeping job (jobs/orderTimeout.job.js) so the two
// trigger paths can never drift apart. `actorId` is the admin/initiator id
// for the refund's audit trail — null for a system/job-triggered cancellation.
export const cancelOrderById = async (orderId, { reason = "Order cancelled", actorId = null } = {}) => {
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) return null;
  if (["DELIVERED", "CANCELLED"].includes(existing.status)) return serializeOrder(existing);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED" },
    include: { restaurant: true, agent: true },
  });

  emitOrderStatusUpdated({
    orderId,
    restaurantId: updated.restaurantId,
    agentId: updated.agentId,
    status: "CANCELLED",
    estimatedDelivery: null,
    timestamp: new Date().toISOString(),
  });

  createNotification({
    userId: updated.customerId,
    title: "Order cancelled",
    body: `${updated.restaurant?.name ?? "The restaurant"} cancelled your order.`,
    type: "ORDER_UPDATE",
    entityId: orderId,
  });
  if (updated.agentId) {
    createNotification({
      userId: updated.agentId,
      title: "Order cancelled",
      body: "This order was cancelled — no pickup needed.",
      type: "ORDER_UPDATE",
      entityId: orderId,
    });
  }

  // Auto-refund a paid order, reusing the existing Cashfree refund flow
  // rather than a second one. Idempotent; COD orders have no cfOrderId so
  // this is a no-op for them.
  if (updated.cfOrderId) {
    try {
      const { initiateRefund } = await import("../payment/refund.service.js");
      await initiateRefund({ cfOrderId: updated.cfOrderId, reason, adminId: actorId });
    } catch (err) {
      logger.error("Auto-refund on order cancellation failed", { orderId, error: err.message });
    }
  }

  logger.info("Order cancelled", { orderId, reason });
  return serializeOrder(updated);
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

// Restaurant → delivery-address distance for pricing — null if either end
// has no real coordinates (free-text addresses, ungeocoded restaurants).
// Same haversine calculation assignDeliveryAgent uses below, not reimplemented.
function computeDeliveryDistanceKm(restaurant, deliveryAddress) {
  const restaurantHasCoords =
    restaurant?.lat != null && restaurant?.lng != null && !(restaurant.lat === 0 && restaurant.lng === 0);
  const addressHasCoords =
    deliveryAddress?.lat != null && deliveryAddress?.lng != null && !(deliveryAddress.lat === 0 && deliveryAddress.lng === 0);
  if (!restaurantHasCoords || !addressHasCoords) return null;
  return haversine(restaurant.lat, restaurant.lng, deliveryAddress.lat, deliveryAddress.lng);
}

// Shared by createOrder and calculateOrderTotal — the one place the pricing
// formula gets wired up with live PlatformSettings and a real distance.
async function priceOrder({ itemTotal, restaurant, deliveryAddress }) {
  const settings = await getPlatformSettingsCached();
  const distanceKm = computeDeliveryDistanceKm(restaurant, deliveryAddress);
  const pricing = computeOrderPricing({ itemTotal, distanceKm, settings });
  return { ...pricing, pricingSnapshot: snapshotSettings(settings) };
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
  // (0, 0) is treated the same as null — it's the Gulf of Guinea, never a
  // real restaurant location in this app's domain, and is exactly what a
  // future bad write (or stale row from before this defensive check
  // existed) would look like if it ever bypassed the null-only contract.
  const restaurantHasCoords =
    order.restaurant.lat != null &&
    order.restaurant.lng != null &&
    !(order.restaurant.lat === 0 && order.restaurant.lng === 0);

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
  // genuine "nobody is close enough", not missing data.
  //
  // EXCEPTION: candidatePool CAN be non-empty here even when the restaurant
  // has no coordinates — that happens whenever there's a city match (the
  // candidatePool assembly above doesn't require coords for that branch,
  // only the full-pool fallback does). Calling haversine(null, null, ...) in
  // that case doesn't throw — JS arithmetic coerces null to 0 — so it
  // silently computed a distance from (0,0) (the Gulf of Guinea) to the
  // agent's real location, producing a nonsense ~8700km "distance" for an
  // Indian restaurant. That distance then got compared against a real
  // radius and (usually) correctly rejected the agent, but for the wrong
  // reason and with misleading logs. Skip the distance computation/check
  // entirely when there are no real coordinates — the city match is the
  // only signal available, and candidatePool is already restricted to it.
  const restaurantLat = order.restaurant.lat;
  const restaurantLng = order.restaurant.lng;

  // Compute distance for every candidate, then filter by each rider's radius
  const withDistance = candidatePool.map((agent) => ({
    ...agent,
    distance: restaurantHasCoords
      ? haversine(restaurantLat, restaurantLng, agent.currentLat, agent.currentLng)
      : null,
  }));

  const inRangeRaw = withDistance.filter((agent) => {
    const radius = Number.isFinite(agent.maxRadiusKm) && agent.maxRadiusKm > 0 ? agent.maxRadiusKm : 20;
    logger.info("Assigning agent for order — computed distance", {
      orderId, agentId: agent.id,
      distanceKm: agent.distance != null ? Math.round(agent.distance * 10) / 10 : null,
      radiusKm: radius, restaurantHasCoords,
    });
    return !restaurantHasCoords || agent.distance <= radius;
  });

  // Multi-factor scoring: distance (45%) + acceptance rate (30%) + idle time (25%)
  // acceptance rate = accepted orders / offered orders over last 30 days
  // idle time (minutes without a delivery) — higher idle time = higher priority
  const agentIds = inRangeRaw.map((a) => a.id);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch offered counts and accepted counts per rider in two aggregations
  const [offeredCounts, acceptedCounts, lastDeliveries, riderLocations] = await Promise.all([
    prisma.order.groupBy({
      by: ["pendingAgentId"],
      where: { pendingAgentId: { in: agentIds }, agentOfferedAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ["agentId"],
      where: { agentId: { in: agentIds }, acceptedAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ["agentId"],
      where: { agentId: { in: agentIds }, status: "DELIVERED" },
      _max: { deliveredAt: true },
    }),
    prisma.riderLocation.findMany({
      where: { riderId: { in: agentIds } },
      select: { riderId: true, updatedAt: true },
    }),
  ]);

  const offeredMap = new Map(offeredCounts.map((r) => [r.pendingAgentId, r._count.id]));
  const acceptedMap = new Map(acceptedCounts.map((r) => [r.agentId, r._count.id]));
  const lastDeliveryMap = new Map(lastDeliveries.map((r) => [r.agentId, r._max.deliveredAt]));
  const locationMap = new Map(riderLocations.map((r) => [r.riderId, r.updatedAt]));

  const now = Date.now();
  const maxDistKm = Math.max(...inRangeRaw.map((a) => a.distance ?? 0), 1);

  const inRangeAgents = inRangeRaw
    .map((agent) => {
      const offered = offeredMap.get(agent.id) ?? 0;
      const accepted = acceptedMap.get(agent.id) ?? 0;
      const acceptanceRate = offered > 0 ? accepted / offered : 0.8; // 80% prior for new riders

      const lastDeliveredAt = lastDeliveryMap.get(agent.id);
      const lastLocationAt = locationMap.get(agent.id);
      const lastActivityMs = Math.max(
        lastDeliveredAt ? new Date(lastDeliveredAt).getTime() : 0,
        lastLocationAt ? new Date(lastLocationAt).getTime() : 0,
      );
      const idleMinutes = lastActivityMs > 0 ? (now - lastActivityMs) / 60000 : 999;

      // Normalize: distance (lower=better → invert), idleTime (higher=better)
      const normDistance = agent.distance != null ? 1 - agent.distance / maxDistKm : 0;
      const normIdle = Math.min(idleMinutes / 120, 1); // cap at 2h

      // score: higher = better pick. Weights: distance 45%, acceptance 30%, idle 25%
      const score = 0.45 * normDistance + 0.30 * acceptanceRate + 0.25 * normIdle;

      return { ...agent, score, acceptanceRate, idleMinutes };
    })
    .sort((a, b) => b.score - a.score);

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
  logger.info("Assigning agent for order — selected", {
    orderId, agentId: selectedAgent.id,
    score: Math.round(selectedAgent.score * 1000) / 1000,
    distanceKm: selectedAgent.distance != null ? Math.round(selectedAgent.distance * 10) / 10 : null,
    acceptanceRate: Math.round(selectedAgent.acceptanceRate * 100),
    idleMinutes: Math.round(selectedAgent.idleMinutes),
  });

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
    // selectedAgent.distance is null for an ungeocoded, city-matched
    // restaurant (see step 4 above) — there's no real distance to report.
    distanceKm: selectedAgent.distance != null ? Math.round(selectedAgent.distance * 10) / 10 : null,
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
    // Use the order's stored riderPayout (computed at order-creation time from
    // PlatformSettings); fall back to 0 rather than a hardcoded ₹40 guess.
    estimatedEarnings: typeof order.riderPayout === "number" ? Math.round(order.riderPayout / 100) : 0,
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
    agent: { id: order.agent.id, name: order.agent.name, phone: order.agent.phone },
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
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { city: true, address: true, lat: true, lng: true },
  });
  if (deliveryAddress && restaurant) assertDeliveryCityMatches(restaurant, deliveryAddress);

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

    const lineTotal = Number(dbItem.price) * requestItem.quantity;
    subtotal += lineTotal;

    // Build items JSON to store in order
    orderItems.push({
      menuItemId: dbItem.id,
      name: dbItem.name,
      price: Number(dbItem.price),
      quantity: requestItem.quantity,
      imageUrl: dbItem.imageUrl,
    });
  }

  // 5. Full pricing breakdown — item total, packaging, GST, delivery fee
  // (using real restaurant→address distance when both are geocoded),
  // platform fee, and the 3-way split, all from live PlatformSettings.
  const pricing = await priceOrder({ itemTotal: subtotal, restaurant, deliveryAddress });

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

  // 7. Coupon discount reduces what the customer pays, not the
  // restaurant/rider/admin payouts — see createOrder for the same rule.
  const total = Math.max(pricing.customerTotal - discount, 0);

  return {
    orderItems,
    subtotal,
    deliveryFee: pricing.deliveryFee,
    deliveryFeeBreakdown: pricing.deliveryFeeBreakdown,
    discount,
    total,
    couponId,
    itemTotal: pricing.itemTotal,
    restaurantPackaging: pricing.restaurantPackaging,
    gstOnItemTotal: pricing.gstOnItemTotal,
    gstOnDeliveryFee: pricing.gstOnDeliveryFee,
    platformFee: pricing.platformFee,
    gstOnPlatformFee: pricing.gstOnPlatformFee,
    distanceKm: pricing.distanceKm,
    restaurantPayout: pricing.restaurantPayout,
    riderPayout: pricing.riderPayout,
    adminRevenue: pricing.adminRevenue,
    pricingSnapshot: pricing.pricingSnapshot,
  };
};
