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
      socket.user = { id: decoded.id, email: decoded.email, role: decoded.role };
      logger.debug("Socket authenticated", { socketId: socket.id, userId: decoded.id });
      next();
    } catch (error) {
      logger.warn("Socket connection rejected: Invalid or expired token", { socketId: socket.id, error: error.message });
      next(new Error("Authentication failed: Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    logger.info("Socket connected", { socketId: socket.id, userId: socket.user.id });
    socket.join(`user:${socket.user.id}`);
    
    socket.on("join_user_room", (userId) => {
      if (!userId) return;
      socket.join(`user:${userId}`);
    });

    socket.on("join_restaurant_room", (restaurantId) => {
      if (!restaurantId) return;
      socket.join(`restaurant:${restaurantId}`);
    });

    socket.on("join_delivery_room", (deliveryUserId) => {
      if (!deliveryUserId) return;
      socket.join(`delivery:${deliveryUserId}`);
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
