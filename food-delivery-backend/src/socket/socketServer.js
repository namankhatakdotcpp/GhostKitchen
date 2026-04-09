import { Server } from "socket.io";
import { logger } from "../utils/logger.js";
import { verifyAccessToken } from "../utils/jwt.js";

let io;

/**
 * Initialize Socket.IO server
 * 
 * @param {http.Server} server - HTTP server instance
 * @returns {Server} Socket.IO instance
 */
export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.NODE_ENV === "production"
        ? [
            "https://ghostkitchen.vercel.app",
            "https://www.ghostkitchen.vercel.app",
          ]
        : ["http://localhost:3000", "http://localhost:3001"],
      credentials: true,
    },
    // Production optimizations
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  /**
   * JWT Authentication Middleware
   * Verifies incoming socket connections with access token
   * Prevents unauthorized access to real-time events
   */
  io.use((socket, next) => {
    try {
      // Token can come from auth.token (recommended) or as a query parameter
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      
      if (!token) {
        logger.warn("Socket connection rejected: No authentication token", {
          socketId: socket.id,
        });
        return next(new Error("Authentication failed: No token provided"));
      }

      // Verify the token
      const decoded = verifyAccessToken(token);
      
      // Attach user info to socket for use in event handlers
      socket.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role,
      };

      logger.debug("Socket authenticated", {
        socketId: socket.id,
        userId: decoded.id,
        role: decoded.role,
      });

      next();
    } catch (error) {
      logger.warn("Socket connection rejected: Invalid or expired token", {
        socketId: socket.id,
        error: error.message,
      });
      next(new Error("Authentication failed: Invalid token"));
    }
  });

  /**
   * Connection handler
   * Manages user and restaurant room joins
   */
  io.on("connection", (socket) => {
    logger.info("Socket connected", {
      socketId: socket.id,
      userId: socket.user.id,
      timestamp: new Date(),
    });

    // Auto-join user to their personal room (no need for frontend emit)
    socket.join(`user:${socket.user.id}`);
    logger.debug(`Socket automatically joined user:${socket.user.id}`, {
      socketId: socket.id,
    });

    /**
     * User joins their personal room
     * Format: user:{userId}
     * Note: This handler kept as fallback for compatibility
     */
    socket.on("join_user_room", (userId) => {
      if (!userId) {
        logger.warn("join_user_room called without userId", {
          socketId: socket.id,
        });
        return;
      }

      socket.join(`user:${userId}`);
      logger.debug(`Socket ${socket.id} joined user:${userId}`);
    });

    /**
     * Restaurant staff joins restaurant room
     * Format: restaurant:{restaurantId}
     */
    socket.on("join_restaurant_room", (restaurantId) => {
      if (!restaurantId) {
        logger.warn("join_restaurant_room called without restaurantId", {
          socketId: socket.id,
        });
        return;
      }

      socket.join(`restaurant:${restaurantId}`);
      logger.debug(`Socket ${socket.id} joined restaurant:${restaurantId}`);
    });

    /**
     * Delivery partner joins room
     * Format: delivery:{deliveryUserId}
     */
    socket.on("join_delivery_room", (deliveryUserId) => {
      if (!deliveryUserId) {
        logger.warn("join_delivery_room called without deliveryUserId", {
          socketId: socket.id,
        });
        return;
      }

      socket.join(`delivery:${deliveryUserId}`);
      logger.debug(
        `Socket ${socket.id} joined delivery:${deliveryUserId}`
      );
    });

    /**
     * Disconnect handler
     */
    socket.on("disconnect", () => {
      logger.info("Socket disconnected", {
        socketId: socket.id,
        timestamp: new Date(),
      });
    });

    /**
     * Error handler
     */
    socket.on("error", (error) => {
      logger.error("Socket error", {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
      });
    });
  });

  logger.info("Socket.IO initialized successfully");
  return io;
};

/**
 * Get Socket.IO instance
 * Use this in services to emit events
 * 
 * @throws {Error} If Socket.IO not initialized
 * @returns {Server} Socket.IO instance
 */
export const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initSocket first.");
  }
  return io;
};

/**
 * Emit event to specific user room
 */
export const emitToUserRoom = (userId, event, data) => {
  const ioInstance = getIO();
  ioInstance.to(`user:${userId}`).emit(event, data);
  logger.debug(`Emitted ${event} to user:${userId}`);
};

/**
 * Emit event to specific restaurant room
 */
export const emitToRestaurantRoom = (restaurantId, event, data) => {
  const ioInstance = getIO();
  ioInstance.to(`restaurant:${restaurantId}`).emit(event, data);
  logger.debug(`Emitted ${event} to restaurant:${restaurantId}`);
};

/**
 * Emit event to specific delivery partner room
 */
export const emitToDeliveryRoom = (deliveryUserId, event, data) => {
  const ioInstance = getIO();
  ioInstance.to(`delivery:${deliveryUserId}`).emit(event, data);
  logger.debug(`Emitted ${event} to delivery:${deliveryUserId}`);
};
