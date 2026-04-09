import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";

/**
 * Order Service - Business Logic
 * 
 * Handles:
 * - Creating orders from cart
 * - Retrieving order history
 * - Updating order status
 * - Managing order lifecycle
 */

export const createOrder = async (userId) => {
  // 1️⃣ FETCH CART ITEMS WITH MENU DETAILS & RESTAURANT
  const cartItems = await prisma.cartItem.findMany({
    where: { userId },
    include: {
      menuItem: {
        include: { restaurant: true }, // Get restaurant info
      },
    },
  });

  // 2️⃣ VALIDATE CART NOT EMPTY
  if (!cartItems.length) {
    throw new AppError("Cart is empty", 400);
  }

  // 3️⃣ 🔥 VALIDATE SINGLE RESTAURANT (SWIGGY RULE)
  // All items in cart must be from same restaurant
  const restaurantIds = new Set(
    cartItems.map((item) => item.menuItem.restaurantId)
  );

  if (restaurantIds.size > 1) {
    throw new AppError(
      "Cart items must be from the same restaurant. Please clear cart and add items from one restaurant only.",
      400
    );
  }

  // 4️⃣ CALCULATE TOTALS
  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.quantity * parseFloat(item.menuItem.price),
    0
  );

  // 5️⃣ ADD DELIVERY FEE (Fixed: 50 INR)
  const DELIVERY_FEE = 50;
  const totalAmount = subtotal + DELIVERY_FEE;

  // 6️⃣ 🔐 USE TRANSACTION (bulletproof DB consistency)
  // If anything fails, ENTIRE operation rolls back
  const order = await prisma.$transaction(async (tx) => {
    // CREATE ORDER
    const newOrder = await tx.order.create({
      data: {
        userId,
        totalAmount,
        status: "PENDING",
        paymentStatus: "PENDING",
        // Map cart items to order items (use DB prices, not frontend)
        orderItems: {
          create: cartItems.map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            price: parseFloat(item.menuItem.price), // 🔐 ALWAYS from DB
          })),
        },
      },
      include: {
        orderItems: {
          include: { menuItem: true },
        },
        user: true,
      },
    });

    // 🔥 CLEAR CART (inside transaction = atomic with order creation)
    await tx.cartItem.deleteMany({ where: { userId } });

    return newOrder;
  });

  return order;
};

/**
 * Get user's order history
 * 
 * @param {string} userId - User ID
 * @returns {Promise<Order[]>} Array of orders with items
 */
export const getUserOrders = async (userId) => {
  const orders = await prisma.order.findMany({
    where: { userId },
    include: {
      orderItems: {
        include: { menuItem: true },
      },
      review: true, // Include review if exists
    },
    orderBy: { createdAt: "desc" }, // Most recent first
  });

  return orders;
};

/**
 * Get single order by ID
 * 
 * @param {string} orderId - Order ID
 * @param {string} userId - User ID (for ownership verification)
 * @returns {Promise<Order>} Order with items
 */
export const getOrderById = async (orderId, userId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: {
        include: { menuItem: true },
      },
      review: true,
      user: true,
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  // Verify ownership
  if (order.userId !== userId) {
    throw new AppError("Unauthorized to view this order", 403);
  }

  return order;
};

/**
 * Update order status (Admin/System use)
 * 
 * @param {string} orderId - Order ID
 * @param {string} status - New status (PENDING, CONFIRMED, PREPARING, OUT_FOR_DELIVERY, DELIVERED, CANCELLED)
 * @returns {Promise<Order>} Updated order
 */
export const updateOrderStatus = async (orderId, status) => {
  const validStatuses = [
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
    "CANCELLED",
  ];

  if (!validStatuses.includes(status)) {
    throw new AppError(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400);
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: {
      orderItems: true,
      user: true,
    },
  });

  return order;
};

/**
 * Update payment status
 * 
 * @param {string} orderId - Order ID
 * @param {string} paymentStatus - New payment status (PENDING, SUCCESS, FAILED)
 * @returns {Promise<Order>} Updated order
 */
export const updatePaymentStatus = async (orderId, paymentStatus) => {
  const validStatuses = ["PENDING", "SUCCESS", "FAILED"];

  if (!validStatuses.includes(paymentStatus)) {
    throw new AppError(`Invalid payment status. Must be one of: ${validStatuses.join(", ")}`, 400);
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus },
    include: {
      orderItems: true,
      user: true,
    },
  });

  return order;
};

/**
 * Cancel order (set status to CANCELLED)
 * 
 * @param {string} orderId - Order ID
 * @param {string} userId - User ID (for ownership verification)
 * @returns {Promise<Order>} Cancelled order
 */
export const cancelOrder = async (orderId, userId) => {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  // Verify ownership
  if (order.userId !== userId) {
    throw new AppError("Unauthorized to cancel this order", 403);
  }

  // Can't cancel delivered or already cancelled orders
  if (order.status === "DELIVERED" || order.status === "CANCELLED") {
    throw new AppError(`Cannot cancel order with status ${order.status}`, 400);
  }

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { status: "CANCELLED" },
    include: {
      orderItems: true,
      user: true,
    },
  });

  return updatedOrder;
};
