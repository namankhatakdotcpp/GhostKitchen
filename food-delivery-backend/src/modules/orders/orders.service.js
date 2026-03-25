import { prisma } from "../../config/prisma.js";

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
  const subtotal = payload.subtotal ?? payload.total ?? 0;
  const deliveryFee = payload.deliveryFee ?? 0;
  const discount = payload.discount ?? 0;
  const total = payload.total ?? subtotal + deliveryFee - discount;

  const order = await prisma.order.create({
    data: {
      customerId,
      restaurantId: payload.restaurantId,
      agentId: payload.agentId ?? null,
      status: "PLACED",
      items: payload.items,
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
