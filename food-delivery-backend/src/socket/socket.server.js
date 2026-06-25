import { updateAgentAvailability, updateOrderStatus } from "../modules/orders/orders.service.js";
import { getIO } from "./socketServer.js";

function withSocketServer(callback) {
  try {
    const io = getIO();
    callback(io);
  } catch {
    // Socket not initialized yet, skip silently
  }
}

export function emitOrderStatusUpdated({ orderId, restaurantId = null, agentId = null, status, estimatedDelivery = null, timestamp }) {
  withSocketServer((io) => {
    const payload = { orderId, status, estimatedDelivery, timestamp };
    io.to(`order-${orderId}`).emit("order:status-updated", payload);
    // Was `shop-${orderId}` — orderId where restaurantId belongs, so this
    // never reached a room any shop dashboard actually joins (shop dashboards
    // join `shop-${restaurantId}`). Harmless today (shop-orders-page.tsx
    // doesn't listen for this event, relying on order:new/agent:assigned plus
    // a 30s poll), but still wrong and worth fixing for future listeners.
    if (restaurantId) io.to(`shop-${restaurantId}`).emit("order:status-updated", payload);
    // The assigned rider's own room — useDeliverySocket already listens for
    // this event, but nothing previously targeted `agent-${agentId}`, so a
    // rider never actually got a real-time push for their assigned order's
    // status changing (e.g. the shop cancelling it after a rider was offered).
    if (agentId) io.to(`agent-${agentId}`).emit("order:status-updated", payload);
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
// Also relays to the active order room so the customer tracking page updates.
export function emitRiderLocationUpdate({ riderId, latitude, longitude, heading = null, speed = null, status, lastSeenAt, activeOrderId = null }) {
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
    // Relay to customer tracking page (only the coordinates — not admin-only data)
    if (activeOrderId) {
      io.to(`order-${activeOrderId}`).emit("agent:location", { lat: latitude, lng: longitude });
    }
  });
}

