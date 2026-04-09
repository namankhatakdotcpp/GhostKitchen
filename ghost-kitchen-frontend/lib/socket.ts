import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "@/store/authStore";

let socket: Socket | null = null;

/**
 * Initialize Socket.IO connection
 * Handles authentication with JWT token
 */
export function getSocket() {
  if (!socket) {
    // Get token from localStorage for authentication
    const token = typeof window !== "undefined" 
      ? localStorage.getItem("accessToken") 
      : null;

    socket = io(
      process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:5000",
      {
        withCredentials: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        transports: ["websocket", "polling"],
        // Auto-connect disabled - will connect on demand
        autoConnect: false,
        // JWT Authentication
        auth: token ? { token } : undefined,
      }
    );

    // Handle connection events
    socket.on("connect", () => {
      console.log("✓ Socket.IO connected:", socket?.id);
    });

    socket.on("disconnect", () => {
      console.log("✗ Socket.IO disconnected");
    });

    socket.on("error", (error: any) => {
      console.error("Socket.IO error:", error);
    });

    socket.on("connect_error", (error: any) => {
      console.error("Socket.IO connection error:", error?.message);
    });
  }

  return socket;
}

/**
 * Connect socket with user authentication
 * Should be called after login
 */
export function connectSocket(userId: string, token?: string) {
  const socket = getSocket();

  // Update authentication token if provided
  if (token) {
    socket.auth = { token };
  }

  // Reconnect to apply new token if needed
  if (!socket.connected) {
    socket.connect();
  }

  // Note: User room (user:${userId}) is now automatically joined on server
  // No need to emit join_user_room - server does it automatically during connection
}

/**
 * Disconnect socket
 * Should be called on logout
 */
export function disconnectSocket() {
  if (socket && socket.connected) {
    socket.disconnect();
  }
}

/**
 * Join restaurant room (for shopkeepers)
 */
export function joinRestaurantRoom(restaurantId: string) {
  const socket = getSocket();
  if (!socket.connected) {
    socket.connect();
  }
  socket.emit("join_restaurant_room", restaurantId);
}

/**
 * Join delivery room (for delivery partners)
 */
export function joinDeliveryRoom(deliveryUserId: string) {
  const socket = getSocket();
  if (!socket.connected) {
    socket.connect();
  }
  socket.emit("join_delivery_room", deliveryUserId);
}
