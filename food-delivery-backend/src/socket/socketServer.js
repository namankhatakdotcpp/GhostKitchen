import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { parse as parseCookies } from "cookie";
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
      // Primary: read access_token from the HttpOnly cookie sent with the handshake.
      // Socket.IO sends cookies automatically when withCredentials:true is set.
      let token = null;

      const cookieHeader = socket.handshake.headers?.cookie;
      if (cookieHeader) {
        const cookies = parseCookies(cookieHeader);
        token = cookies.access_token ?? null;
      }

      // Fallback: auth object (useful for native mobile / non-browser clients)
      if (!token) {
        token = socket.handshake.auth?.token ?? null;
      }

      if (!token) {
        // Allow unauthenticated connections for public browsing
        socket.data.user = null
        return next()
      }

      const decoded = verifyAccessToken(token);
      socket.user = {
        id: decoded.userId,
        email: decoded.email,
        roles: decoded.roles ?? ["CUSTOMER"],
        role: decoded.activeRole ?? decoded.role ?? "CUSTOMER",
        restaurantId: decoded.restaurantId ?? null,
      };
      socket.data.user = socket.user
      logger.debug("Socket authenticated via cookie", { socketId: socket.id, userId: decoded.userId });
      next();
    } catch (error) {
      // Expired token — don't reject, just mark as unauthenticated so client can refresh and reconnect
      socket.data.user = null
      next()
    }
  });

  io.on("connection", (socket) => {
    const user = socket.user;
    logger.info("Socket connected", { socketId: socket.id, userId: user?.id, role: user?.role });

    // Rate limit socket events — prevent event flooding
    const eventCounts = new Map()
    socket.use(([event], next) => {
      const key = `${socket.id}:${event}`
      const count = (eventCounts.get(key) || 0) + 1
      eventCounts.set(key, count)
      setTimeout(() => eventCounts.delete(key), 1000)
      if (count > 20) {
        return next(new Error('Event rate limit exceeded'))
      }
      next()
    })

    // Auto-join rooms based on role (skip for unauthenticated connections)
    if (user) {
      socket.join(`user:${user.id}`);
      if (user.role === "ADMIN") socket.join("admin");
      if (user.role === "DELIVERY") socket.join(`agent-${user.id}`);
    }

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
