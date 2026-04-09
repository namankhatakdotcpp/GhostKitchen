import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "@/store/authStore";

let socket: Socket | null = null;

/**
 * Socket error tracking for diagnostics
 */
let lastSocketError: { message: string; timestamp: Date } | null = null;

/**
 * Initialize Socket.IO connection
 * Handles authentication with JWT token and comprehensive error handling
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
        // ===== PRODUCTION (RENDER) SETTINGS =====
        // Vercel frontend → Render backend requires credentials for cookies
        withCredentials: true,
        
        // WebSocket first (faster), polling fallback (more reliable on Render)
        // IMPORTANT: Render uses dynamic ports, so polling is sometimes needed
        transports: ["websocket", "polling"],
        
        // Reconnection strategy for Render's variable network conditions
        reconnection: true,
        reconnectionDelay: 1000,      // Start waiting 1s between reconnects
        reconnectionDelayMax: 5000,   // Cap at 5s between attempts
        reconnectionAttempts: 5,      // Try 5 times before giving up
        
        // Auto-connect disabled - will connect on demand to save bandwidth
        autoConnect: false,
        
        // JWT Authentication - token sent with handshake
        auth: token ? { token } : undefined,
      }
    );

    // ===== SUCCESS EVENT HANDLERS =====

    socket.on("connect", () => {
      console.log("✓ Socket.IO connected successfully:", socket?.id);
      lastSocketError = null; // Clear error on successful connection
    });

    socket.on("disconnect", (reason: string) => {
      console.log("✗ Socket.IO disconnected", { reason });
      // 'io server namespace disconnect' is normal logout
      // Other reasons indicate unexpected disconnection
      if (reason !== "io server namespace disconnect") {
        console.warn("Unexpected socket disconnection reason:", reason);
      }
    });

    // ===== ERROR EVENT HANDLERS =====

    socket.on("error", (error: any) => {
      const errorMsg = typeof error === "string" ? error : error?.message || "Unknown socket error";
      console.error("❌ Socket.IO error:", errorMsg, { timestamp: new Date() });
      lastSocketError = {
        message: errorMsg,
        timestamp: new Date(),
      };
    });

    socket.on("connect_error", (error: any) => {
      const errorMsg = typeof error === "string" ? error : error?.message || "Connection failed";
      console.error("❌ Socket.IO connection error:", errorMsg, {
        timestamp: new Date(),
        description: "Failed to establish WebSocket connection - will retry with polling fallback",
      });
      lastSocketError = {
        message: `Connection Error: ${errorMsg}`,
        timestamp: new Date(),
      };
    });

    // Handle reconnection attempts
    socket.on("reconnect_attempt", () => {
      console.log("🔄 Attempting to reconnect to Socket.IO...");
    });

    socket.on("reconnect_failed", () => {
      const error = "Failed to reconnect after max attempts";
      console.error("❌", error);
      lastSocketError = {
        message: error,
        timestamp: new Date(),
      };
    });
  }

  return socket;
}

/**
 * Get last socket error for diagnostics
 */
export function getLastSocketError() {
  return lastSocketError;
}

/**
 * Check if socket is connected
 */
export function isSocketConnected() {
  return socket?.connected ?? false;
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
