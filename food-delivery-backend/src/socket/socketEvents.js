/**
 * Socket Events Layer
 * 
 * Centralized event emission for order updates
 * Called from services (not controllers)
 * 
 * Events:
 * - order:new - New order created
 * - order:update - Order status changed
 * - order:cancelled - Order cancelled
 */

import { emitToUserRoom, emitToRestaurantRoom, emitToDeliveryRoom } from "./socketServer.js";
import { logger } from "../utils/logger.js";

/**
 * Emit when new order is created
 * Broadcast to:
 * - Restaurant staff (order:new event)
 * - User (order:new event)
 */
export const emitNewOrder = (order) => {
  try {
    const orderData = {
      id: order.id,
      userId: order.userId,
      restaurantId: order.restaurantId,
      totalAmount: order.totalAmount,
      status: order.status,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt,
      orderItems: order.orderItems,
    };

    // Notify restaurant about new order
    if (order.restaurantId) {
      emitToRestaurantRoom(order.restaurantId, "order:new", orderData);
    }

    // Notify customer about their order
    if (order.userId) {
      emitToUserRoom(order.userId, "order:new", orderData);
    }

    logger.info("Emitted order:new event", {
      orderId: order.id,
      userId: order.userId,
      restaurantId: order.restaurantId,
    });
  } catch (error) {
    logger.error("Failed to emit order:new event", {
      orderId: order.id,
      error: error.message,
    });
  }
};

/**
 * Emit when order status is updated
 * Broadcast to:
 * - User (order:update event)
 * - Restaurant staff (order:update event)
 * - Delivery partner (order:update event)
 */
export const emitOrderUpdate = (order) => {
  try {
    const orderData = {
      id: order.id,
      userId: order.userId,
      restaurantId: order.restaurantId,
      deliveryUserId: order.deliveryUserId,
      totalAmount: order.totalAmount,
      status: order.status,
      paymentStatus: order.paymentStatus,
      updatedAt: order.updatedAt,
      orderItems: order.orderItems,
    };

    // Notify customer about status change
    if (order.userId) {
      emitToUserRoom(order.userId, "order:update", orderData);
    }

    // Notify restaurant about status change
    if (order.restaurantId) {
      emitToRestaurantRoom(order.restaurantId, "order:update", orderData);
    }

    // Notify delivery partner if assigned
    if (order.deliveryUserId) {
      emitToDeliveryRoom(order.deliveryUserId, "order:update", orderData);
    }

    logger.info("Emitted order:update event", {
      orderId: order.id,
      newStatus: order.status,
      userId: order.userId,
      restaurantId: order.restaurantId,
      deliveryUserId: order.deliveryUserId,
    });
  } catch (error) {
    logger.error("Failed to emit order:update event", {
      orderId: order.id,
      error: error.message,
    });
  }
};

/**
 * Emit when order is cancelled
 * Broadcast to all related parties
 */
export const emitOrderCancelled = (order, reason = "Unknown") => {
  try {
    const orderData = {
      id: order.id,
      userId: order.userId,
      restaurantId: order.restaurantId,
      status: "CANCELLED",
      cancelledAt: new Date(),
      reason,
    };

    // Notify customer
    if (order.userId) {
      emitToUserRoom(order.userId, "order:cancelled", orderData);
    }

    // Notify restaurant
    if (order.restaurantId) {
      emitToRestaurantRoom(order.restaurantId, "order:cancelled", orderData);
    }

    // Notify delivery partner
    if (order.deliveryUserId) {
      emitToDeliveryRoom(order.deliveryUserId, "order:cancelled", orderData);
    }

    logger.warn("Emitted order:cancelled event", {
      orderId: order.id,
      userId: order.userId,
      restaurantId: order.restaurantId,
      reason,
    });
  } catch (error) {
    logger.error("Failed to emit order:cancelled event", {
      orderId: order.id,
      error: error.message,
    });
  }
};

/**
 * Emit typing indicator (for live notifications)
 */
export const emitTypingIndicator = (restaurantId, message) => {
  try {
    emitToRestaurantRoom(restaurantId, "order:notification", {
      type: "notification",
      message,
      timestamp: new Date(),
    });

    logger.debug(`Emitted notification to restaurant:${restaurantId}`, {
      message,
    });
  } catch (error) {
    logger.error("Failed to emit notification", {
      restaurantId,
      error: error.message,
    });
  }
};
