"use client";

/**
 * useSocket Hook
 * 
 * Manages Socket.IO connection and real-time event subscriptions
 * Handles cleanup on unmount
 */

import { useEffect, useCallback } from "react";
import { getSocket, connectSocket, disconnectSocket } from "@/lib/socket";
import { useOrderStore } from "@/store/orderStore";
import { useAuthStore } from "@/store/authStore";

export function useSocket() {
  const { user } = useAuthStore();
  const { updateOrder } = useOrderStore();

  // Connect socket when user is authenticated
  useEffect(() => {
    if (!user) return;

    connectSocket(user.id);

    return () => {
      // Cleanup on unmount or logout
      disconnectSocket();
    };
  }, [user?.id]);

  // Listen for order updates (versioned events)
  useEffect(() => {
    const socket = getSocket();

    // Real-time order update from server (v1)
    const handleOrderUpdate = (order: any) => {
      console.log("📡 Received order:update:v1", order);
      updateOrder(order);
    };

    // New order created notification (v1)
    const handleNewOrder = (order: any) => {
      console.log("📡 Received order:new:v1", order);
      updateOrder(order);
    };

    // Order cancelled notification (v1)
    const handleOrderCancelled = (data: any) => {
      console.log("📡 Received order:cancelled:v1", data);
      updateOrder({
        ...data,
        status: "CANCELLED",
      });
    };

    // Listen for versioned events
    socket.on("order:update:v1", handleOrderUpdate);
    socket.on("order:new:v1", handleNewOrder);
    socket.on("order:cancelled:v1", handleOrderCancelled);

    return () => {
      socket.off("order:update:v1", handleOrderUpdate);
      socket.off("order:new:v1", handleNewOrder);
      socket.off("order:cancelled:v1", handleOrderCancelled);
    };
  }, [updateOrder]);
}

/**
 * useRestaurantSocket Hook
 * 
 * For restaurant shopkeepers to receive new orders
 */
export function useRestaurantSocket(restaurantId: string | null) {
  const { updateOrder } = useOrderStore();

  useEffect(() => {
    if (!restaurantId) return;

    const socket = getSocket();

    // Connect socket if not already connected
    if (!socket.connected) {
      socket.connect();
    }

    // Join restaurant room
    socket.emit("join_restaurant_room", restaurantId);

    // Listen for new orders in restaurant
    const handleNewOrder = (order: any) => {
      console.log("🍽️ New order for restaurant (v1):", order);
      // Could add to a separate "pending orders" list
      updateOrder(order);
    };

    const handleOrderUpdate = (order: any) => {
      console.log("🍽️ Order update (v1):", order);
      updateOrder(order);
    };

    // Listen for versioned events
    socket.on("order:new:v1", handleNewOrder);
    socket.on("order:update:v1", handleOrderUpdate);

    return () => {
      socket.off("order:new:v1", handleNewOrder);
      socket.off("order:update:v1", handleOrderUpdate);
    };
  }, [restaurantId, updateOrder]);
}

/**
 * useDeliverySocket Hook
 * 
 * For delivery partners to track assigned orders
 */
export function useDeliverySocket(deliveryUserId: string | null) {
  const { updateOrder } = useOrderStore();

  useEffect(() => {
    if (!deliveryUserId) return;

    const socket = getSocket();

    // Connect socket if not already connected
    if (!socket.connected) {
      socket.connect();
    }

    // Join delivery room
    socket.emit("join_delivery_room", deliveryUserId);

    // Listen for order updates (versioned)
    const handleOrderUpdate = (order: any) => {
      console.log("🚗 Delivery order update (v1):", order);
      updateOrder(order);
    };

    socket.on("order:update:v1", handleOrderUpdate);

    return () => {
      socket.off("order:update:v1", handleOrderUpdate);
    };
  }, [deliveryUserId, updateOrder]);
}
