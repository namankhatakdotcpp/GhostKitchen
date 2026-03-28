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

  // 6. Validate and apply coupon if provided
  let discount = 0;
  let couponId = null;

  if (payload.couponCode) {
    const coupon = await prisma.coupon.findUnique({
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

  // 8. Calculate total = subtotal + deliveryFee - discount
  const total = subtotal + deliveryFee - discount;

  // 9-11. Create order in transaction
  const order = await prisma.$transaction(async (tx) => {
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
        total,
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

    // If coupon was used, increment usedCount
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
