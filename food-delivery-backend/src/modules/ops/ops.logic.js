/**
 * Pure operations-intelligence calculations (no DB, no I/O) so they can be unit
 * tested in isolation. The service layer fetches rows and feeds them in here.
 *
 * All money is in paise; times are Date objects or ISO strings.
 */

export const OPS_THRESHOLDS = Object.freeze({
  RIDER_OFFLINE_MS: 10 * 60 * 1000, // rider not seen for >10 min
  ORDER_STUCK_MS: 30 * 60 * 1000, // order not out for delivery after >30 min
  RESTAURANT_OVERLOADED: 10, // active orders at one restaurant
});

const minutesBetween = (a, b) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 60000);

/**
 * Computes live fleet alerts from a snapshot.
 * @param {{ riders, activeOrders, openOrders, restaurants }} data
 *   - riders: [{ id, name, lastSeenAt, activeDeliveries }]
 *   - activeOrders: OUT_FOR_DELIVERY orders [{ id, orderNumber, estimatedDelivery, rider }]
 *   - openOrders: not-yet-delivered orders [{ id, orderNumber, status, placedAt, restaurant }]
 *   - restaurants: [{ id, name, activeOrders }]
 */
export function computeFleetAlerts(data, now = new Date(), thresholds = OPS_THRESHOLDS) {
  const nowMs = now.getTime();
  const alerts = [];

  // 1. Riders offline > 10 min (only those that have ever reported a location)
  for (const r of data.riders ?? []) {
    if (!r.lastSeenAt) continue;
    const elapsed = nowMs - new Date(r.lastSeenAt).getTime();
    if (elapsed > thresholds.RIDER_OFFLINE_MS) {
      alerts.push({
        type: "RIDER_OFFLINE",
        severity: r.activeDeliveries > 0 ? "CRITICAL" : "HIGH",
        entityType: "RIDER",
        entityId: r.id,
        message: `${r.name} has been offline for ${Math.round(elapsed / 60000)} min` +
          (r.activeDeliveries > 0 ? ` with ${r.activeDeliveries} active delivery(s)` : ""),
      });
    }
  }

  // 2. Deliveries past their ETA
  for (const o of data.activeOrders ?? []) {
    if (!o.estimatedDelivery) continue;
    const lateMs = nowMs - new Date(o.estimatedDelivery).getTime();
    if (lateMs > 0) {
      alerts.push({
        type: "DELIVERY_DELAYED",
        severity: lateMs > 15 * 60000 ? "HIGH" : "MEDIUM",
        entityType: "ORDER",
        entityId: o.id,
        message: `Order #${o.orderNumber} is ${Math.round(lateMs / 60000)} min past its ETA`,
      });
    }
  }

  // 3. Orders stuck (not yet out for delivery) > 30 min
  for (const o of data.openOrders ?? []) {
    if (o.status === "OUT_FOR_DELIVERY" || o.status === "DELIVERED" || o.status === "CANCELLED") continue;
    const ageMs = nowMs - new Date(o.placedAt).getTime();
    if (ageMs > thresholds.ORDER_STUCK_MS) {
      alerts.push({
        type: "ORDER_STUCK",
        severity: "HIGH",
        entityType: "ORDER",
        entityId: o.id,
        message: `Order #${o.orderNumber} stuck in ${o.status} for ${Math.round(ageMs / 60000)} min` +
          (o.restaurant?.name ? ` at ${o.restaurant.name}` : ""),
      });
    }
  }

  // 4. Overloaded restaurants
  for (const r of data.restaurants ?? []) {
    if ((r.activeOrders ?? 0) >= thresholds.RESTAURANT_OVERLOADED) {
      alerts.push({
        type: "RESTAURANT_OVERLOADED",
        severity: "MEDIUM",
        entityType: "RESTAURANT",
        entityId: r.id,
        message: `${r.name} is overloaded with ${r.activeOrders} active orders`,
      });
    }
  }

  // Most severe first
  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/**
 * SLA summary over a set of delivered orders.
 * @param {Array<{ deliveredAt, estimatedDelivery }>} orders
 */
export function computeSlaSummary(orders = []) {
  const withEta = orders.filter((o) => o.deliveredAt && o.estimatedDelivery);
  let onTime = 0;
  let delayed = 0;
  let totalLatenessMin = 0;

  for (const o of withEta) {
    const lateMin = minutesBetween(o.deliveredAt, o.estimatedDelivery);
    if (lateMin > 0) {
      delayed += 1;
      totalLatenessMin += lateMin;
    } else {
      onTime += 1;
    }
  }

  const measured = withEta.length;
  return {
    measuredOrders: measured,
    onTime,
    delayed,
    onTimeRate: measured ? Math.round((onTime / measured) * 100) : null,
    avgLatenessMin: delayed ? Math.round(totalLatenessMin / delayed) : 0,
  };
}

/**
 * Per-rider performance from their orders.
 * @param {Array} orders  agent orders [{ agentId, status, placedAt, deliveredAt, restaurant, deliveryAddress }]
 * @param {Array} riders  [{ id, name }]
 * @param {function} distanceFn (lat1,lng1,lat2,lng2) => metres  (injected for testability)
 */
export function computeRiderPerformance(orders = [], riders = [], distanceFn = null) {
  const byId = new Map(riders.map((r) => [r.id, { riderId: r.id, name: r.name, delivered: 0, cancelled: 0, assigned: 0, totalDeliveryMin: 0, distanceM: 0 }]));

  for (const o of orders) {
    if (!o.agentId) continue;
    const row = byId.get(o.agentId) ?? { riderId: o.agentId, name: "Rider", delivered: 0, cancelled: 0, assigned: 0, totalDeliveryMin: 0, distanceM: 0 };
    row.assigned += 1;
    if (o.status === "CANCELLED") row.cancelled += 1;
    if (o.status === "DELIVERED") {
      row.delivered += 1;
      if (o.deliveredAt && o.placedAt) row.totalDeliveryMin += Math.max(0, minutesBetween(o.deliveredAt, o.placedAt));
      if (distanceFn && o.restaurant?.lat != null && o.deliveryAddress?.lat != null) {
        row.distanceM += distanceFn(o.restaurant.lat, o.restaurant.lng, o.deliveryAddress.lat, o.deliveryAddress.lng);
      }
    }
    byId.set(o.agentId, row);
  }

  return Array.from(byId.values())
    .map((r) => ({
      riderId: r.riderId,
      name: r.name,
      deliveries: r.delivered,
      avgDeliveryMin: r.delivered ? Math.round(r.totalDeliveryMin / r.delivered) : null,
      distanceKm: Math.round(r.distanceM / 1000),
      cancellationRate: r.assigned ? Math.round((r.cancelled / r.assigned) * 100) : 0,
    }))
    .sort((a, b) => b.deliveries - a.deliveries);
}

/**
 * Per-restaurant performance.
 * @param {Array} orders  [{ restaurantId, status, total }]
 * @param {Array} restaurants [{ id, name, rating }]
 */
export function computeRestaurantPerformance(orders = [], restaurants = []) {
  const byId = new Map(restaurants.map((r) => [r.id, { restaurantId: r.id, name: r.name, rating: r.rating, revenuePaise: 0, delivered: 0, volume: 0 }]));

  for (const o of orders) {
    const row = byId.get(o.restaurantId);
    if (!row) continue;
    row.volume += 1;
    if (o.status === "DELIVERED") {
      row.delivered += 1;
      row.revenuePaise += Number(o.total) || 0;
    }
  }

  return Array.from(byId.values())
    .map((r) => ({
      restaurantId: r.restaurantId,
      name: r.name,
      rating: r.rating,
      revenuePaise: r.revenuePaise,
      orderVolume: r.volume,
      deliveredOrders: r.delivered,
    }))
    .sort((a, b) => b.revenuePaise - a.revenuePaise);
}

// ── Auto-incident creation (Phase 1) ─────────────────────────────────────────
// Higher thresholds than the display alerts above — only the serious conditions
// become tracked incidents.
export const AUTO_INCIDENT_THRESHOLDS = Object.freeze({
  RESTAURANT_OVERLOADED_HIGH: 20,
  RESTAURANT_OVERLOADED_CRITICAL: 35,
  RIDER_OFFLINE_ASSIGNED_MS: 15 * 60 * 1000,
  DELIVERY_LATE_HIGH_MS: 15 * 60 * 1000,
  DELIVERY_LATE_CRITICAL_MS: 30 * 60 * 1000,
  ORDER_STUCK_MS: 45 * 60 * 1000,
});

/**
 * Derives the incidents that SHOULD exist right now from a fleet snapshot.
 * Each candidate is keyed by (category, entityId) for deduplication upstream.
 */
export function computeAutoIncidents(data, now = new Date(), t = AUTO_INCIDENT_THRESHOLDS) {
  const nowMs = now.getTime();
  const out = [];

  for (const r of data.restaurants ?? []) {
    const active = r.activeOrders ?? 0;
    if (active > t.RESTAURANT_OVERLOADED_CRITICAL) {
      out.push({ category: "RESTAURANT_OVERLOADED", entityType: "RESTAURANT", entityId: r.id, severity: "CRITICAL", title: `${r.name} critically overloaded (${active} active orders)` });
    } else if (active > t.RESTAURANT_OVERLOADED_HIGH) {
      out.push({ category: "RESTAURANT_OVERLOADED", entityType: "RESTAURANT", entityId: r.id, severity: "HIGH", title: `${r.name} overloaded (${active} active orders)` });
    }
  }

  for (const rider of data.riders ?? []) {
    if (!rider.lastSeenAt || (rider.activeDeliveries ?? 0) <= 0) continue;
    const offlineMs = nowMs - new Date(rider.lastSeenAt).getTime();
    if (offlineMs > t.RIDER_OFFLINE_ASSIGNED_MS) {
      out.push({ category: "RIDER_OFFLINE", entityType: "RIDER", entityId: rider.id, severity: "HIGH", title: `${rider.name} offline ${Math.round(offlineMs / 60000)} min with an active delivery` });
    }
  }

  for (const o of data.activeOrders ?? []) {
    if (!o.estimatedDelivery) continue;
    const lateMs = nowMs - new Date(o.estimatedDelivery).getTime();
    if (lateMs > t.DELIVERY_LATE_CRITICAL_MS) {
      out.push({ category: "DELIVERY_DELAYED", entityType: "ORDER", entityId: o.id, severity: "CRITICAL", title: `Order #${o.orderNumber} is ${Math.round(lateMs / 60000)} min past ETA` });
    } else if (lateMs > t.DELIVERY_LATE_HIGH_MS) {
      out.push({ category: "DELIVERY_DELAYED", entityType: "ORDER", entityId: o.id, severity: "HIGH", title: `Order #${o.orderNumber} is ${Math.round(lateMs / 60000)} min past ETA` });
    }
  }

  for (const o of data.openOrders ?? []) {
    if (["OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(o.status)) continue;
    const ageMs = nowMs - new Date(o.placedAt).getTime();
    if (ageMs > t.ORDER_STUCK_MS) {
      out.push({ category: "ORDER_STUCK", entityType: "ORDER", entityId: o.id, severity: "HIGH", title: `Order #${o.orderNumber} stuck in ${o.status} for ${Math.round(ageMs / 60000)} min` });
    }
  }

  return out;
}

// ── Escalation engine (Phase 2) ──────────────────────────────────────────────
const SEVERITY_ORDER = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// Higher of two severities (incidents only ever escalate up, never down).
export function maxSeverity(a, b) {
  return SEVERITY_ORDER.indexOf(a) >= SEVERITY_ORDER.indexOf(b) ? a : b;
}

/**
 * Decides how an OPEN incident should escalate given its age.
 * Returns { severity (new or null), renotify, email }.
 */
export function nextEscalation(incident, now = new Date(), renotifyWindowMs = 2 * 60 * 60 * 1000) {
  const openMin = (now.getTime() - new Date(incident.createdAt).getTime()) / 60000;
  const sev = incident.severity;

  let severity = null;
  if (openMin > 60 && sev === "HIGH") severity = "CRITICAL";
  else if (openMin > 30 && sev === "LOW") severity = "MEDIUM";
  else if (openMin > 30 && sev === "MEDIUM") severity = "HIGH";

  const notifiedRecently =
    incident.lastNotifiedAt && now.getTime() - new Date(incident.lastNotifiedAt).getTime() < renotifyWindowMs;

  const renotify = openMin > 120 && !notifiedRecently;
  const email = openMin > 180 && !notifiedRecently;

  return { severity, renotify, email };
}
