import { updateAgentAvailability, updateOrderStatus } from "../modules/orders/orders.service.js";
import { getIO } from "./socketServer.js";

const activeOrderByAgent = new Map();

function withSocketServer(callback) {
  try {
    const io = getIO();
    callback(io);
  } catch {
    // Socket not initialized yet, skip silently
  }
}

export function emitOrderStatusUpdated({ orderId, status, estimatedDelivery = null, timestamp }) {
  withSocketServer((io) => {
    const payload = { orderId, status, estimatedDelivery, timestamp };
    io.to(`order-${orderId}`).emit("order:status-updated", payload);
    io.to(`shop-${orderId}`).emit("order:status-updated", payload);
    io.to("admin").emit("order:status-updated", payload);
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

// Broadcasts a rider's new GPS position to the admin live operations map.
// Only the "admin" room receives it — rider coordinates are not public data.
export function emitRiderLocationUpdate({ riderId, latitude, longitude, heading = null, speed = null, status, lastSeenAt }) {
  withSocketServer((io) => {
    io.to("admin").emit("rider:location:update", {
      riderId,
      latitude,
      longitude,
      heading,
      speed,
      status,
      lastSeenAt,
    });
  });
}

