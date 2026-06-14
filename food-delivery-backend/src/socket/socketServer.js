import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { parse as parseCookies } from "cookie";
import { logger } from "../utils/logger.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { getRedis } from "../config/redis.js";
import { prisma } from "../config/prisma.js";

let io;

// Exported for unit testing. Verifies that `user` owns or is authorised to
// observe `orderId` before allowing the socket to join `order-{id}` rooms.
// Never trusts the client payload — ownership is always resolved via Prisma.
export const checkOrderRoomAccess = async (orderId, user) => {
  if (!user) return false;
  if (!orderId || typeof orderId !== "string" || orderId.length > 100) return false;
  if (user.roles?.includes("ADMIN")) return true;
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, agentId: true, restaurantId: true },
    });
    if (!order) return false;
    if (order.customerId === user.id) return true;
    if (order.agentId && order.agentId === user.id) return true;
    if (user.restaurantId && order.restaurantId === user.restaurantId) return true;
    return false;
  } catch {
    return false;
  }
};

export const initSocket = async (server) => {
  // Mirror the HTTP CORS allowlist (env ALLOWED_ORIGINS + project previews)
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
    .split(",").map((o) => o.trim());

  io = new Server(server, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        if (/^https:\/\/ghost-kitchen[a-z0-9-]*\.vercel\.app$/.test(origin)) return cb(null, true);
        if (origin.startsWith("http://localhost:")) return cb(null, true);
        cb(new Error("Socket CORS: origin not allowed"));
      },
      credentials: true,
    },
    transports: ["websocket", "polling"],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // The @socket.io/redis-adapter requires two independent ioredis connections
  // (pub + sub). The main Redis client may be an Upstash REST client (which has
  // no .duplicate() or pub/sub support). We always create fresh ioredis connections
  // here using REDIS_URL so the adapter works regardless of which Redis driver the
  // rest of the app uses.
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const { default: Redis } = await import("ioredis");
      const isUpstash = redisUrl.includes("upstash");
      const tlsOptions = isUpstash ? { tls: { rejectUnauthorized: false } } : {};
      const pubClient = new Redis(redisUrl, { ...tlsOptions, maxRetriesPerRequest: null, lazyConnect: false });
      const subClient = new Redis(redisUrl, { ...tlsOptions, maxRetriesPerRequest: null, lazyConnect: false });
      io.adapter(createAdapter(pubClient, subClient));
      logger.info("✓ Socket.IO Redis adapter configured (ioredis)");
    } catch (err) {
      logger.error("❌ Failed to configure Socket.IO Redis adapter. Falling back to memory.", { error: err.message });
    }
  } else {
    logger.warn("⚠ REDIS_URL not set. Socket.IO using in-memory adapter — single-instance only.");
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
      if (user.roles?.includes("ADMIN")) socket.join("admin");
      if (user.roles?.includes("DELIVERY")) socket.join(`agent-${user.id}`);
    }

    // Room authorization — without these checks any connected socket could
    // join "admin" or another user's room and receive their order events.
    const canJoin = (room) => {
      if (typeof room !== "string" || room.length > 120) return false;
      if (room === "admin") return Boolean(user?.roles?.includes("ADMIN"));
      if (room.startsWith("user:")) return user?.id === room.slice(5);
      if (room.startsWith("agent-") || room.startsWith("delivery:")) {
        const target = room.startsWith("agent-") ? room.slice(6) : room.slice(9);
        return Boolean(user && user.id === target && user.roles?.includes("DELIVERY"));
      }
      if (room.startsWith("shop-") || room.startsWith("restaurant:")) {
        const target = room.startsWith("shop-") ? room.slice(5) : room.slice(11);
        if (!user) return false;
        if (user.roles?.includes("ADMIN")) return true;
        return user.restaurantId === target;
      }
      // Order rooms are handled asynchronously in the join-room handler via
      // checkOrderRoomAccess — sync canJoin never admits them.
      if (room.startsWith("order-")) return false;
      return false;
    };

    socket.on("join_user_room", (userId) => {
      if (userId && canJoin(`user:${userId}`)) socket.join(`user:${userId}`);
    });

    socket.on("join_restaurant_room", (restaurantId) => {
      if (!restaurantId || !canJoin(`shop-${restaurantId}`)) return;
      // Join both naming conventions for compatibility
      socket.join(`restaurant:${restaurantId}`);
      socket.join(`shop-${restaurantId}`);
    });

    socket.on("join_delivery_room", (deliveryUserId) => {
      if (!deliveryUserId || !canJoin(`agent-${deliveryUserId}`)) return;
      socket.join(`delivery:${deliveryUserId}`);
      socket.join(`agent-${deliveryUserId}`);
    });

    // Generic room join. Order rooms get an async DB ownership check; all
    // other rooms go through the synchronous canJoin guard above.
    socket.on("join-room", async (room) => {
      if (typeof room !== "string" || room.length > 120) return;

      if (room.startsWith("order-")) {
        const orderId = room.slice(6);
        const allowed = await checkOrderRoomAccess(orderId, user);
        if (allowed) {
          socket.join(room);
        } else {
          logger.warn("Socket order room access denied", {
            socketId: socket.id,
            orderId,
            userId: user?.id ?? "unauthenticated",
          });
        }
        return;
      }

      if (canJoin(room)) socket.join(room);
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

// Broadcasts to every connected client — used for platform-wide events like maintenance
export const emitToAll = (event, data) => {
  try {
    getIO().emit(event, data);
  } catch { /* Socket not yet initialized — safe to ignore */ }
};
