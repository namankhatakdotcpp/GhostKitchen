"use client";

/**
 * useSocket Hook
 * 
 * Manages Socket.IO connection and real-time event subscriptions
 * Handles cleanup on unmount
 */

import { useEffect, useCallback, useState } from "react";
import { getSocket, connectSocket, disconnectSocket, getLastSocketError, isSocketConnected } from "@/lib/socket";
import { useOrderStore } from "@/store/orderStore";
import { useAuthStore } from "@/store/authStore";

/**
 * useSocketStatus Hook
 * 
 * Monitor socket connection status and errors
 * Returns: { isConnected, lastError, isReconnecting }
 */
export function useSocketStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    // Track connection status
    const handleConnect = () => {
      setIsConnected(true);
      setIsReconnecting(false);
      setLastError(null);
    };

    const handleDisconnect = () => {
      setIsConnected(false);
    };

    const handleError = (error: any) => {
      const errorMsg = typeof error === "string" ? error : error?.message || "Socket error occurred";
      setLastError(errorMsg);
    };

    const handleConnectError = (error: any) => {
      const errorMsg = typeof error === "string" ? error : error?.message || "Connection error";
      setLastError(`Connection failed: ${errorMsg}`);
    };

    const handleReconnectAttempt = () => {
      setIsReconnecting(true);
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("error", handleError);
    socket.on("connect_error", handleConnectError);
    socket.on("reconnect_attempt", handleReconnectAttempt);

    // Set initial state
    setIsConnected(socket.connected);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("error", handleError);
      socket.off("connect_error", handleConnectError);
      socket.off("reconnect_attempt", handleReconnectAttempt);
    };
  }, []);

  return { isConnected, lastError, isReconnecting };
}

export function useSocket() {
  const { user } = useAuthStore();
  const { updateOrder, fetchOrders } = useOrderStore();

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

    const handleOrderUpdate = (payload: any) => {
      const order = payload?.order ?? payload;
      updateOrder(order);
    };

    const handleNewOrder = (payload: any) => {
      const order = payload?.order ?? payload;
      updateOrder(order);
    };

    socket.on("order:status-updated", handleOrderUpdate);
    socket.on("order:new", handleNewOrder);

    return () => {
      socket.off("order:status-updated", handleOrderUpdate);
      socket.off("order:new", handleNewOrder);
    };
  }, [updateOrder]);

  // Fallback polling: Fetch orders every 10 seconds if Socket.IO is disconnected
  // This ensures orders stay updated even if real-time connection fails
  useEffect(() => {
    if (!user) return;

    let pollingInterval: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (pollingInterval) clearInterval(pollingInterval);

      // Poll every 10 seconds when socket is disconnected
      pollingInterval = setInterval(async () => {
        try {
          const socket = getSocket();

          // Only poll if socket is not connected
          if (!socket.connected) {
            console.log("📡 Socket disconnected - using polling fallback to fetch orders");
            await fetchOrders();
          }
        } catch (error) {
          // Silent fail for polling - logging handled in store
          console.debug("Fallback polling - fetch orders error:", error);
        }
      }, 10000); // 10 second polling interval
    };

    // Start polling immediately
    startPolling();

    // Monitor socket connection status to adjust polling
    const socket = getSocket();
    const handleConnect = () => {
      console.log("✓ Socket connected - stopping polling fallback");
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    };

    const handleDisconnect = () => {
      console.log("✗ Socket disconnected - starting polling fallback");
      startPolling();
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
    };
  }, [user, fetchOrders]);
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
    const handleNewOrder = (payload: any) => {
      updateOrder(payload?.order ?? payload);
    };

    const handleOrderUpdate = (payload: any) => {
      updateOrder(payload?.order ?? payload);
    };

    socket.on("order:new", handleNewOrder);
    socket.on("order:status-updated", handleOrderUpdate);

    return () => {
      socket.off("order:new", handleNewOrder);
      socket.off("order:status-updated", handleOrderUpdate);
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

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("join_delivery_room", deliveryUserId);

    const handleOrderUpdate = (payload: any) => {
      const order = payload?.order ?? payload;
      updateOrder(order);
    };

    // agent:assigned fires when admin/auto-assignment picks this rider
    const handleAssigned = (payload: any) => {
      updateOrder(payload?.order ?? payload);
    };

    socket.on("order:status-updated", handleOrderUpdate);
    socket.on("order:assigned", handleAssigned);

    return () => {
      socket.off("order:status-updated", handleOrderUpdate);
      socket.off("order:assigned", handleAssigned);
    };
  }, [deliveryUserId, updateOrder]);
}
