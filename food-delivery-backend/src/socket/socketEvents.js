/**
 * Socket Events Layer
 * 
 * Centralized event emission for order updates
 * Called from services (not controllers)
 * 
 * VERSIONED EVENTS:
 * - order:new:v1 - New order created
 * - order:update:v1 - Order status changed
 * - order:cancelled:v1 - Order cancelled
 * - order:notification:v1 - Live notifications
 * 
 * Events use semantic versioning (v1, v2, etc.) for backward compatibility.
 * This allows future schema changes without breaking existing clients.
 * Clients can listen to specific versions or implement version fallback logic.
 */

import { emitToUserRoom, emitToRestaurantRoom, emitToDeliveryRoom } from "./socketServer.js";
import { logger } from "../utils/logger.js";

/**
 * Emit when new order is created
 * Event: order:new:v1
 * Broadcast to:
 * - Restaurant staff
 * - Customer
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
      emitToRestaurantRoom(order.restaurantId, "order:new:v1", orderData);
    }

    // Notify customer about their order
    if (order.userId) {
      emitToUserRoom(order.userId, "order:new:v1", orderData);
    }

    logger.info("Emitted order:new:v1 event", {
      orderId: order.id,
      userId: order.userId,
      restaurantId: order.restaurantId,
    });
  } catch (error) {
    logger.error("Failed to emit order:new:v1 event", {
      orderId: order.id,
      error: error.message,
    });
  }
};

/**
 * Emit when order status is updated
 * Event: order:update:v1
 * Broadcast to:
 * - Customer
 * - Restaurant staff
 * - Delivery partner
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
      emitToUserRoom(order.userId, "order:update:v1", orderData);
    }

    // Notify restaurant about status change
    if (order.restaurantId) {
      emitToRestaurantRoom(order.restaurantId, "order:update:v1", orderData);
    }

    // Notify delivery partner if assigned
    if (order.deliveryUserId) {
      emitToDeliveryRoom(order.deliveryUserId, "order:update:v1", orderData);
    }

    logger.info("Emitted order:update:v1 event", {
      orderId: order.id,
      newStatus: order.status,
      userId: order.userId,
      restaurantId: order.restaurantId,
      deliveryUserId: order.deliveryUserId,
    });
  } catch (error) {
    logger.error("Failed to emit order:update:v1 event", {
      orderId: order.id,
      error: error.message,
    });
  }
};

/**
 * Emit when order is cancelled
 * Event: order:cancelled:v1
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
      emitToUserRoom(order.userId, "order:cancelled:v1", orderData);
    }

    // Notify restaurant
    if (order.restaurantId) {
      emitToRestaurantRoom(order.restaurantId, "order:cancelled:v1", orderData);
    }

    // Notify delivery partner
    if (order.deliveryUserId) {
      emitToDeliveryRoom(order.deliveryUserId, "order:cancelled:v1", orderData);
    }

    logger.warn("Emitted order:cancelled:v1 event", {
      orderId: order.id,
      userId: order.userId,
      restaurantId: order.restaurantId,
      reason,
    });
  } catch (error) {
    logger.error("Failed to emit order:cancelled:v1 event", {
      orderId: order.id,
      error: error.message,
    });
  }
};

/**
 * Emit live notifications
 * Event: order:notification:v1
 */
export const emitTypingIndicator = (restaurantId, message) => {
  try {
    emitToRestaurantRoom(restaurantId, "order:notification:v1", {
      type: "notification",
      message,
      timestamp: new Date(),
    });

    logger.debug(`Emitted order:notification:v1 to restaurant:${restaurantId}`, {
      message,
    });
  } catch (error) {
    logger.error("Failed to emit order:notification:v1", {
      restaurantId,
      error: error.message,
    });
  }
};
