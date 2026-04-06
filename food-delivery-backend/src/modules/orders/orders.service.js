import { prisma } from "../../config/prisma.js";

const FIXED_DELIVERY_FEE = 50; // ₹50 fixed delivery fee

function serializeOrder(order) {
  if (!order) {
    return null;
  }

  return {
    ...order,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    discount: Number(order.discount),
    total: Number(order.total),
  };
}

export const listOrders = async (customerId) => {
  const orders = await prisma.order.findMany({
    where: customerId ? { customerId } : undefined,
    include: {
      restaurant: true,
      agent: true,
    },
    orderBy: {
      placedAt: "desc",
    },
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

export const createOrder = async (payload, customerId) => {
  // ============================================
  // SECURITY: Server-side calculation only
  // Ignore all client-provided price values
  // ============================================

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

  // 5. Use fixed delivery fee
  const deliveryFee = FIXED_DELIVERY_FEE;

  // 6-8. Calculate total = subtotal + deliveryFee - discount
  // NOTE: Coupon validation moved into transaction for atomicity (prevents race condition)
  const total = subtotal + deliveryFee; // discount calculated in transaction

  // 9-11. Create order in transaction with coupon validation inside to prevent race condition
  const order = await prisma.$transaction(async (tx) => {
    // Handle coupon validation INSIDE transaction for atomicity
    let discount = 0;
    let couponId = null;

    if (payload.couponCode) {
      const coupon = await tx.coupon.findUnique({
        where: { code: payload.couponCode },
      });

      if (!coupon) {
        throw new Error("Invalid coupon code");
      }

      // Validate coupon conditions
      if (new Date() > new Date(coupon.expiresAt)) {
        throw new Error("Coupon has expired");
      }

      if (coupon.usedCount >= coupon.maxUses) {
        throw new Error("Coupon usage limit exceeded");
      }

      if (subtotal < Number(coupon.minOrder)) {
        throw new Error(
          `Coupon requires minimum order of ₹${coupon.minOrder}`
        );
      }

      // Calculate discount
      if (coupon.discountType === "PERCENTAGE") {
        discount = subtotal * (Number(coupon.discountValue) / 100);
      } else if (coupon.discountType === "FLAT") {
        discount = Number(coupon.discountValue);
      }

      couponId = coupon.id;
    }

    // Final total with discount
    const finalTotal = subtotal + deliveryFee - discount;

    // Create order with server-calculated values only
    const newOrder = await tx.order.create({
      data: {
        customerId,
        restaurantId: payload.restaurantId,
        agentId: payload.agentId ?? null,
        status: "PLACED",
        items: itemsToStore,
        subtotal,
        deliveryFee,
        discount,
        total: finalTotal,
        deliveryAddress: payload.deliveryAddress,
        estimatedDelivery: payload.estimatedDelivery
          ? new Date(payload.estimatedDelivery)
          : null,
      },
      include: {
        restaurant: true,
        agent: true,
      },
    });

    // If coupon was used, increment usedCount INSIDE transaction
    if (couponId) {
      await tx.coupon.update({
        where: { id: couponId },
        data: { usedCount: { increment: 1 } },
      });
    }

    return newOrder;
  });

  return serializeOrder(order);
};

export const updateOrderStatus = async ({ orderId, status, agentId }) => {
  const order = await prisma.order.update({
    where: { id: orderId },
    data: {
      status,
      ...(agentId ? { agentId } : {}),
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

export const assignDeliveryAgent = async (orderId, io) => {
  // 1. Fetch the order with restaurant location
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { restaurant: true },
  });

  if (!order) {
    return null;
  }

  // 2. Find available DELIVERY role users who are online (isAvailable: true)
  // and have a current location set
  const availableAgents = await prisma.user.findMany({
    where: {
      role: "DELIVERY",
      isAvailable: true,
      currentLat: { not: null },
      currentLng: { not: null },
    },
  });

  if (availableAgents.length === 0) {
    // No agents available — emit alert to admin room
    io.to("admin").emit("order:no-agent", {
      orderId,
      restaurantName: order.restaurant.name,
    });
    return null;
  }

  // 3. Simple distance-based selection (Haversine formula)
  // Pick the closest available agent to the restaurant
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

  const restaurantLat = order.restaurant.currentLat ?? 28.6139;
  const restaurantLng = order.restaurant.currentLng ?? 77.209;

  const agentWithDistance = availableAgents.map((agent) => ({
    ...agent,
    distance: haversine(restaurantLat, restaurantLng, agent.currentLat, agent.currentLng),
  }));

  agentWithDistance.sort((a, b) => a.distance - b.distance);
  const selectedAgent = agentWithDistance[0];

  // 4. Update order with agent, set agent as unavailable
  const [updatedOrder] = await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: { agentId: selectedAgent.id },
      include: { restaurant: true, agent: true },
    }),
    prisma.user.update({
      where: { id: selectedAgent.id },
      data: { isAvailable: false },
    }),
  ]);

  // 5. Emit to agent: full order details for their assignment modal
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
      rating: 4.5, // TODO: calculate from reviews
    },
  });
  io.to(`shop-${order.restaurantId}`).emit("agent:assigned", {
    orderId,
    agentName: selectedAgent.name,
  });
  io.to("admin").emit("agent:assigned", { orderId, agentId: selectedAgent.id });

  return selectedAgent;
};

export const calculateOrderTotal = async ({ restaurantId, items, couponCode }) => {
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

  // 5. Use fixed delivery fee
  const deliveryFee = FIXED_DELIVERY_FEE;

  // 6. Validate and apply coupon if provided
  let discount = 0;
  let couponId = null;

  if (couponCode) {
    const coupon = await prisma.coupon.findUnique({
      where: { code: couponCode },
    });

    if (!coupon) {
      throw new Error("Invalid coupon code");
    }

    // Validate coupon conditions
    if (new Date() > new Date(coupon.expiresAt)) {
      throw new Error("Coupon has expired");
    }

    if (coupon.usedCount >= coupon.maxUses) {
      throw new Error("Coupon usage limit exceeded");
    }

    if (subtotal < Number(coupon.minOrder)) {
      throw new Error(`Coupon requires minimum order of ₹${coupon.minOrder}`);
    }

    // Calculate discount
    if (coupon.discountType === "PERCENTAGE") {
      discount = subtotal * (Number(coupon.discountValue) / 100);
    } else if (coupon.discountType === "FLAT") {
      discount = Number(coupon.discountValue);
    }

    couponId = coupon.id;
  }

  // 7. Calculate total = subtotal + deliveryFee - discount
  const total = subtotal + deliveryFee - discount;

  return { orderItems, subtotal, deliveryFee, discount, total, couponId };
};
