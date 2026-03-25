import { Server } from "socket.io";

import { verifyToken } from "../utils/jwt.js";
import { updateAgentAvailability, updateOrderStatus } from "../modules/orders/orders.service.js";

let ioInstance = null;
const activeOrderByAgent = new Map();

function extractToken(socket) {
  const authToken = socket.handshake.auth?.token;
  const headerToken = socket.handshake.headers.authorization;

  if (authToken) {
    return authToken;
  }

  if (headerToken?.startsWith("Bearer ")) {
    return headerToken.split(" ")[1];
  }

  return null;
}

function allowedRoom(room) {
  return (
    room === "admin" ||
    room.startsWith("order-") ||
    room.startsWith("shop-") ||
    room.startsWith("agent-")
  );
}

function withSocketServer(callback) {
  if (!ioInstance) {
    return;
  }

  callback(ioInstance);
}

export function emitOrderStatusUpdated({ orderId, status, timestamp }) {
  withSocketServer((io) => {
    io.to(`order-${orderId}`).emit("order:status-updated", {
      orderId,
      status,
      timestamp,
    });
    io.to("admin").emit("order:status-updated", {
      orderId,
      status,
      timestamp,
    });
  });
}

export function emitOrderNew({ restaurantId, order }) {
  withSocketServer((io) => {
    io.to(`shop-${restaurantId}`).emit("order:new", { order });
    io.to("admin").emit("order:new", { order });
  });
}

export function emitAgentAssigned({ orderId, restaurantId, agent }) {
  withSocketServer((io) => {
    io.to(`order-${orderId}`).emit("agent:assigned", { orderId, agent });
    io.to(`shop-${restaurantId}`).emit("agent:assigned", { orderId, agent });
    io.to("admin").emit("agent:assigned", { orderId, agent });
  });
}

export function emitOrderAssignedToAgent({
  agentId,
  order,
  pickup,
  dropoff,
  earnings,
}) {
  activeOrderByAgent.set(agentId, order.id);

  withSocketServer((io) => {
    io.to(`agent-${agentId}`).emit("order:assigned", {
      order,
      pickup,
      dropoff,
      earnings,
    });
    io.to("admin").emit("order:assigned", {
      orderId: order.id,
      agentId,
    });
  });
}

export function createSocketServer(server) {
  const io = new Server(server, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = extractToken(socket);

    if (!token) {
      return next(new Error("Unauthorized"));
    }

    try {
      const user = verifyToken(token);
      socket.data.user = user;
      return next();
    } catch (error) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;

    if (user?.role === "ADMIN") {
      socket.join("admin");
    }

    if (user?.role === "DELIVERY") {
      socket.join(`agent-${user.userId}`);
    }

    socket.on("join-room", (room) => {
      if (typeof room === "string" && allowedRoom(room)) {
        socket.join(room);
      }
    });

    socket.on("leave-room", (room) => {
      if (typeof room === "string" && allowedRoom(room)) {
        socket.leave(room);
      }
    });

    socket.on("agent:location", async ({ agentId, lat, lng }) => {
      const currentOrderId =
        activeOrderByAgent.get(agentId) ?? socket.data.activeOrderId ?? null;

      try {
        await updateAgentAvailability(agentId, true, { lat, lng });
      } catch (error) {
        // Ignore transient DB update failures so realtime updates continue.
      }

      if (currentOrderId) {
        io.to(`order-${currentOrderId}`).emit("agent:location", {
          agentId,
          lat,
          lng,
        });
      }

      io.to("admin").emit("agent:location", {
        agentId,
        orderId: currentOrderId,
        lat,
        lng,
      });
    });

    socket.on("order:status", async ({ orderId, status, agentId }) => {
      try {
        const order = await updateOrderStatus({ orderId, status, agentId });
        const timestamp = new Date().toISOString();

        if (agentId && status === "OUT_FOR_DELIVERY") {
          activeOrderByAgent.set(agentId, orderId);
          socket.data.activeOrderId = orderId;
          emitAgentAssigned({
            orderId,
            restaurantId: order.restaurantId,
            agent: order.agent ?? { id: agentId },
          });
        }

        if (status === "DELIVERED" && agentId) {
          activeOrderByAgent.delete(agentId);
        }

        emitOrderStatusUpdated({ orderId, status, timestamp });
      } catch (error) {
        socket.emit("socket:error", {
          message: "Unable to update order status",
        });
      }
    });

    socket.on("agent:online", async ({ agentId }) => {
      try {
        await updateAgentAvailability(agentId, true);
      } catch (error) {
        socket.emit("socket:error", {
          message: "Unable to update agent availability",
        });
      }
    });

    socket.on("agent:offline", async ({ agentId }) => {
      activeOrderByAgent.delete(agentId);

      try {
        await updateAgentAvailability(agentId, false);
      } catch (error) {
        socket.emit("socket:error", {
          message: "Unable to update agent availability",
        });
      }
    });
  });

  ioInstance = io;

  return io;
}
