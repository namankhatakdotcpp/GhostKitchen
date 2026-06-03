import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

let lastSocketError: { message: string; timestamp: Date } | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(
      process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000",
      {
        // The access_token cookie is sent automatically with the WebSocket
        // handshake because withCredentials:true is set below.
        // No token needs to be read from localStorage or injected manually.
        withCredentials: true,

        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        autoConnect: false,
      }
    );

    socket.on("connect", () => {
      console.log("✓ Socket.IO connected:", socket?.id);
      lastSocketError = null;
    });

    socket.on("disconnect", (reason: string) => {
      if (reason !== "io server namespace disconnect") {
        console.warn("Socket disconnected:", reason);
      }
    });

    socket.on("connect_error", (error: Error) => {
      console.error("Socket connection error:", error.message);
      lastSocketError = {
        message: error.message,
        timestamp: new Date(),
      };
    });
  }

  return socket;
}

export function isSocketConnected() {
  return socket?.connected ?? false;
}

export function getLastSocketError() {
  return lastSocketError;
}

export function connectSocket(_userId?: string) {
  const s = getSocket();
  if (!s.connected) s.connect();
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}

export function joinRoleRooms(role: string, userId: string, restaurantId?: string | null) {
  const s = getSocket();
  if (!s.connected) s.connect();

  s.emit("leave-room", `agent-${userId}`);
  if (restaurantId) s.emit("leave-room", `shop-${restaurantId}`);

  if (role === "DELIVERY") {
    s.emit("join-room", `agent-${userId}`);
    s.emit("join_delivery_room", userId);
  } else if (role === "RESTAURANT" && restaurantId) {
    s.emit("join-room", `shop-${restaurantId}`);
    s.emit("join_restaurant_room", restaurantId);
  }
}

export function joinRestaurantRoom(restaurantId: string) {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit("join_restaurant_room", restaurantId);
}

export function joinDeliveryRoom(deliveryUserId: string) {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit("join_delivery_room", deliveryUserId);
}
