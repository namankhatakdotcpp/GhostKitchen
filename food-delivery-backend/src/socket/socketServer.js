import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { logger } from "../utils/logger.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { getRedis } from "../config/redis.js";

let io;

export const initSocket = async (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === "production"
        ? [
            process.env.FRONTEND_URL || "https://ghostkitchen.vercel.app",
            "https://ghost-kitchen-mw4mnfcmo-namans-projects-dfbad539.vercel.app"
          ]
        : ["http://localhost:3000", "http://localhost:3001"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  const redisInstance = getRedis();

  if (redisInstance) {
    try {
      const pubClient = redisInstance;
      const subClient = redisInstance.duplicate();
      await subClient.connect();
      io.adapter(createAdapter(pubClient, subClient));
      logger.info("✓ Socket.IO Redis adapter configured");
    } catch (err) {
      logger.error("❌ Failed to configure Socket.IO Redis adapter. Falling back to memory.", { error: err.message });
    }
  } else {
    logger.warn("⚠ Redis not available. Socket.IO falling back to in-memory adapter.");
  }

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        logger.warn("Socket connection rejected: No authentication token", { socketId: socket.id });
        return next(new Error("Authentication failed: No token provided"));
      }
      const decoded = verifyAccessToken(token);
      // JWT payload stores the user id as `userId` (not `id`)
      socket.user = { id: decoded.userId, email: decoded.email, role: decoded.role };
      logger.debug("Socket authenticated", { socketId: socket.id, userId: decoded.userId });
      next();
    } catch (error) {
      logger.warn("Socket connection rejected: Invalid or expired token", { socketId: socket.id, error: error.message });
      next(new Error("Authentication failed: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    logger.info("Socket connected", { socketId: socket.id, userId: user.id, role: user.role });

    // Auto-join rooms based on role
    socket.join(`user:${user.id}`);
    if (user.role === "ADMIN") socket.join("admin");
    if (user.role === "DELIVERY") socket.join(`agent-${user.id}`);

    socket.on("join_user_room", (userId) => {
      if (!userId) return;
      socket.join(`user:${userId}`);
    });

    socket.on("join_restaurant_room", (restaurantId) => {
      if (!restaurantId) return;
      // Join both naming conventions for compatibility
      socket.join(`restaurant:${restaurantId}`);
      socket.join(`shop-${restaurantId}`);
    });

    socket.on("join_delivery_room", (deliveryUserId) => {
      if (!deliveryUserId) return;
      socket.join(`delivery:${deliveryUserId}`);
      socket.join(`agent-${deliveryUserId}`);
    });

    // Generic room join used by order tracking page and shop
    socket.on("join-room", (room) => {
      if (typeof room !== "string") return;
      const allowed =
        room === "admin" ||
        room.startsWith("order-") ||
        room.startsWith("shop-") ||
        room.startsWith("agent-");
      if (allowed) socket.join(room);
    });

    socket.on("leave-room", (room) => {
      if (typeof room !== "string") return;
      socket.leave(room);
    });

    socket.on("disconnect", () => {
      logger.info("Socket disconnected", { socketId: socket.id });
    });

    socket.on("error", (error) => {
      logger.error("Socket error", { socketId: socket.id, error: error.message });
    });
  });

  logger.info("✓ Socket.IO initialized successfully");
  return io;
};

export const getIO = () => {
  if (!io) throw new Error("Socket.IO not initialized. Call initSocket first.");
  return io;
};

export const emitToUserRoom = (userId, event, data) => {
  const ioInstance = getIO();
  ioInstance.to(`user:${userId}`).emit(event, data);
};

export const emitToRestaurantRoom = (restaurantId, event, data) => {
  const ioInstance = getIO();
  ioInstance.to(`restaurant:${restaurantId}`).emit(event, data);
};

export const emitToDeliveryRoom = (deliveryUserId, event, data) => {
  const ioInstance = getIO();
  ioInstance.to(`delivery:${deliveryUserId}`).emit(event, data);
};
