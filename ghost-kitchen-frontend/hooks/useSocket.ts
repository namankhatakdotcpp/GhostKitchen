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

  // Listen for order updates
  useEffect(() => {
    const socket = getSocket();

    // Real-time order update from server
    const handleOrderUpdate = (order: any) => {
      console.log("📡 Received order:update", order);
      updateOrder(order);
    };

    // New order created notification
    const handleNewOrder = (order: any) => {
      console.log("📡 Received order:new", order);
      updateOrder(order);
    };

    // Order cancelled notification
    const handleOrderCancelled = (data: any) => {
      console.log("📡 Received order:cancelled", data);
      updateOrder({
        ...data,
        status: "CANCELLED",
      });
    };

    socket.on("order:update", handleOrderUpdate);
    socket.on("order:new", handleNewOrder);
    socket.on("order:cancelled", handleOrderCancelled);

    return () => {
      socket.off("order:update", handleOrderUpdate);
      socket.off("order:new", handleNewOrder);
      socket.off("order:cancelled", handleOrderCancelled);
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
      console.log("🍽️ New order for restaurant:", order);
      // Could add to a separate "pending orders" list
      updateOrder(order);
    };

    const handleOrderUpdate = (order: any) => {
      console.log("🍽️ Order update:", order);
      updateOrder(order);
    };

    socket.on("order:new", handleNewOrder);
    socket.on("order:update", handleOrderUpdate);

    return () => {
      socket.off("order:new", handleNewOrder);
      socket.off("order:update", handleOrderUpdate);
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

    // Listen for order updates
    const handleOrderUpdate = (order: any) => {
      console.log("🚗 Delivery order update:", order);
      updateOrder(order);
    };

    socket.on("order:update", handleOrderUpdate);

    return () => {
      socket.off("order:update", handleOrderUpdate);
    };
  }, [deliveryUserId, updateOrder]);
}
