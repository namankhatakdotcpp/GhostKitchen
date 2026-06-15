import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { logger } from "../../utils/logger.js";
import { createNotification } from "../notification/notification.service.js";
import { sendAdminAlertEmail } from "../../services/email.service.js";
import {
  computeFleetAlerts,
  computeSlaSummary,
  computeRiderPerformance,
  computeRestaurantPerformance,
  computeRiderScore,
  computeRestaurantScore,
  computeTrend,
  computeAutoIncidents,
  nextEscalation,
  maxSeverity,
  OPS_THRESHOLDS,
} from "./ops.logic.js";

const ACTIVE_DELIVERY_STATUSES = ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"];
// PENDING is a PaymentStatus value; no code path ever sets Order.status = "PENDING".
// Including it caused a PostgreSQL enum error on DBs created before PENDING was
// added to the OrderStatus type. Orders flow: PLACED → CONFIRMED → PREPARING → …
const OPEN_STATUSES = ["PLACED", "CONFIRMED", "PREPARING"];

// Haversine metres — mirrors the assignment algorithm; injected into the rider
// performance calc so distance is testable without DB.
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

const windowStart = (days = 7) => {
  const d = new Date();
  d.setDate(d.getDate() - (Number(days) - 1));
  d.setHours(0, 0, 0, 0);
  return d;
};

// Gathers the live fleet snapshot once; shared by getFleetAlerts (display) and
// runAutoIncidents (persistence) so the data is fetched a single way.
const gatherOpsSnapshot = async () => {
  const [riderLocations, activeOrders, openOrders, restaurantCounts] = await Promise.all([
    prisma.riderLocation.findMany({
      where: { rider: { roles: { has: "DELIVERY" } } },
      select: { riderId: true, lastSeenAt: true, rider: { select: { name: true } } },
    }),
    prisma.order.findMany({
      where: { status: "OUT_FOR_DELIVERY" },
      select: { id: true, estimatedDelivery: true, agentId: true },
    }),
    prisma.order.findMany({
      where: { status: { in: OPEN_STATUSES } },
      select: { id: true, status: true, placedAt: true, restaurant: { select: { name: true } } },
    }),
    prisma.order.groupBy({
      by: ["restaurantId"],
      where: { status: { in: ACTIVE_DELIVERY_STATUSES } },
      _count: { id: true },
    }),
  ]);

  const activeByRider = new Map();
  for (const o of activeOrders) {
    if (o.agentId) activeByRider.set(o.agentId, (activeByRider.get(o.agentId) ?? 0) + 1);
  }

  const restaurantIds = restaurantCounts.map((r) => r.restaurantId);
  const restaurants = restaurantIds.length
    ? await prisma.restaurant.findMany({ where: { id: { in: restaurantIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(restaurants.map((r) => [r.id, r.name]));

  return {
    riders: riderLocations.map((l) => ({
      id: l.riderId,
      name: l.rider?.name ?? "Rider",
      lastSeenAt: l.lastSeenAt,
      activeDeliveries: activeByRider.get(l.riderId) ?? 0,
    })),
    activeOrders: activeOrders.map((o) => ({ id: o.id, orderNumber: o.id.slice(-6).toUpperCase(), estimatedDelivery: o.estimatedDelivery })),
    openOrders: openOrders.map((o) => ({ id: o.id, orderNumber: o.id.slice(-6).toUpperCase(), status: o.status, placedAt: o.placedAt, restaurant: o.restaurant })),
    restaurants: restaurantCounts.map((r) => ({ id: r.restaurantId, name: nameById.get(r.restaurantId) ?? "Restaurant", activeOrders: r._count.id })),
  };
};

// ── Fleet alerts (live, computed — no persistence) ───────────────────────────
export const getFleetAlerts = async () => {
  return computeFleetAlerts(await gatherOpsSnapshot());
};

// ── SLA monitoring ───────────────────────────────────────────────────────────
export const getSlaSummary = async ({ days = 7 } = {}) => {
  const orders = await prisma.order.findMany({
    where: { status: "DELIVERED", deliveredAt: { gte: windowStart(days) } },
    select: { deliveredAt: true, estimatedDelivery: true },
  });
  return { ...computeSlaSummary(orders), days: Number(days) };
};

// ── Rider performance + score ────────────────────────────────────────────────
export const getRiderPerformance = async ({ days = 7 } = {}) => {
  const numDays = Number(days);
  const start = windowStart(numDays);
  // Previous window starts immediately before current window (same length).
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - numDays);

  const [orders, riders, onTimeOrders, sessions, prevOrders] = await Promise.all([
    // Current window: all assigned orders (delivery time, distance, cancellation)
    prisma.order.findMany({
      where: { agentId: { not: null }, createdAt: { gte: start } },
      select: {
        agentId: true, status: true, placedAt: true, deliveredAt: true,
        deliveryAddress: true, restaurant: { select: { lat: true, lng: true } },
      },
    }),
    prisma.user.findMany({ where: { roles: { has: "DELIVERY" } }, select: { id: true, name: true } }),
    // On-time rate: only delivered orders that have an ETA to compare against
    prisma.order.findMany({
      where: {
        agentId: { not: null }, status: "DELIVERED", createdAt: { gte: start },
        deliveredAt: { not: null }, estimatedDelivery: { not: null },
      },
      select: { agentId: true, deliveredAt: true, estimatedDelivery: true },
    }),
    // Rider duty sessions for active-hour scoring
    prisma.riderSession.findMany({
      where: { startedAt: { gte: start } },
      select: { riderId: true, durationMin: true },
    }),
    // Previous window delivered orders (trend: compare delivery count)
    prisma.order.findMany({
      where: {
        agentId: { not: null }, status: "DELIVERED",
        createdAt: { gte: prevStart, lt: start },
      },
      select: { agentId: true },
    }),
  ]);

  // On-time rate per rider
  const onTimeByRider = new Map();
  for (const o of onTimeOrders) {
    if (!o.agentId) continue;
    const e = onTimeByRider.get(o.agentId) ?? { onTime: 0, total: 0 };
    e.total += 1;
    if (new Date(o.deliveredAt) <= new Date(o.estimatedDelivery)) e.onTime += 1;
    onTimeByRider.set(o.agentId, e);
  }

  // Active hours per rider from duty sessions
  const activeHoursByRider = new Map();
  for (const s of sessions) {
    const prev = activeHoursByRider.get(s.riderId) ?? 0;
    activeHoursByRider.set(s.riderId, prev + (s.durationMin ?? 0) / 60);
  }

  // Previous-window delivery count per rider (for trend)
  const prevByRider = new Map();
  for (const o of prevOrders) {
    if (!o.agentId) continue;
    prevByRider.set(o.agentId, (prevByRider.get(o.agentId) ?? 0) + 1);
  }

  const shaped = orders.map((o) => ({
    agentId: o.agentId, status: o.status, placedAt: o.placedAt, deliveredAt: o.deliveredAt,
    deliveryAddress: o.deliveryAddress && typeof o.deliveryAddress === "object" ? o.deliveryAddress : null,
    restaurant: o.restaurant,
  }));

  const base = computeRiderPerformance(shaped, riders, haversineM);

  // Attach score, grade, rank, trend
  const enhanced = base.map((r) => {
    const ot = onTimeByRider.get(r.riderId);
    const onTimeRate = ot && ot.total > 0 ? Math.round((ot.onTime / ot.total) * 100) : null;
    const activeHours = Math.round((activeHoursByRider.get(r.riderId) ?? 0) * 10) / 10;
    const { score, grade } = computeRiderScore({
      onTimeRate, avgDeliveryMin: r.avgDeliveryMin, cancellationRate: r.cancellationRate,
      activeHoursInWindow: activeHours, days: numDays,
    });
    const trend = computeTrend(r.deliveries, prevByRider.get(r.riderId) ?? 0);
    return { ...r, onTimeRate, activeHours, score, grade, trend };
  });

  // Rank: highest score first; ties broken by deliveries
  enhanced.sort((a, b) => b.score - a.score || b.deliveries - a.deliveries);
  const ranked = enhanced.map((r, i) => ({ ...r, rank: i + 1 }));

  return { riders: ranked, days: numDays };
};

// ── Restaurant performance + health score ────────────────────────────────────
export const getRestaurantPerformance = async ({ days = 7 } = {}) => {
  const numDays = Number(days);
  const start = windowStart(numDays);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - numDays);

  const [orders, restaurants, prepOrders, prevOrders] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: start } },
      select: { restaurantId: true, status: true, total: true },
    }),
    prisma.restaurant.findMany({ select: { id: true, name: true, rating: true } }),
    // Prep-time data: orders that have a readyAt timestamp (after Wave B migration)
    prisma.order.findMany({
      where: { createdAt: { gte: start }, readyAt: { not: null } },
      select: { restaurantId: true, placedAt: true, readyAt: true },
    }),
    // Previous window revenue (for trend)
    prisma.order.findMany({
      where: { status: "DELIVERED", createdAt: { gte: prevStart, lt: start } },
      select: { restaurantId: true, total: true },
    }),
  ]);

  // Avg prep time per restaurant (readyAt - placedAt)
  const prepByRestaurant = new Map();
  for (const o of prepOrders) {
    if (!o.readyAt || !o.placedAt) continue;
    const prepMin = Math.round((new Date(o.readyAt) - new Date(o.placedAt)) / 60000);
    if (prepMin < 0 || prepMin > 180) continue; // sanity bounds
    const e = prepByRestaurant.get(o.restaurantId) ?? { total: 0, count: 0 };
    e.total += prepMin;
    e.count += 1;
    prepByRestaurant.set(o.restaurantId, e);
  }

  // Previous-window revenue per restaurant (for trend)
  const prevRevByRestaurant = new Map();
  for (const o of prevOrders) {
    prevRevByRestaurant.set(o.restaurantId, (prevRevByRestaurant.get(o.restaurantId) ?? 0) + Number(o.total));
  }

  const base = computeRestaurantPerformance(orders, restaurants);
  const topRevenue = base.reduce((m, r) => Math.max(m, r.revenuePaise), 1);

  const enhanced = base.map((r) => {
    const pe = prepByRestaurant.get(r.restaurantId);
    const avgPrepMin = pe && pe.count > 0 ? Math.round(pe.total / pe.count) : null;
    const cancellationRate = r.orderVolume > 0
      ? Math.round(((r.orderVolume - r.deliveredOrders) / r.orderVolume) * 100)
      : 0;
    const { score, grade } = computeRestaurantScore(
      { revenuePaise: r.revenuePaise, rating: r.rating, avgPrepMin, cancellationRate },
      topRevenue,
    );
    const trend = computeTrend(r.revenuePaise, prevRevByRestaurant.get(r.restaurantId) ?? 0);
    return { ...r, avgPrepMin, cancellationRate, score, healthGrade: grade, trend };
  });

  enhanced.sort((a, b) => b.score - a.score);
  const ranked = enhanced.map((r, i) => ({ ...r, rank: i + 1 }));

  return { restaurants: ranked, days: numDays };
};

// ── Leaderboards (Phase 5) ───────────────────────────────────────────────────

export const getRiderLeaderboard = async ({ order = "top", limit = 10, days = 7 } = {}) => {
  const result = await getRiderPerformance({ days });
  // Performance already sorted by score DESC; bottom = reverse
  const list = order === "bottom"
    ? [...result.riders].sort((a, b) => a.score - b.score)
    : result.riders;
  return {
    riders: list.slice(0, Math.min(Number(limit) || 10, 50)),
    total: result.riders.length,
    order,
    days: result.days,
  };
};

export const getRestaurantLeaderboard = async ({ order = "top", limit = 10, days = 7 } = {}) => {
  const result = await getRestaurantPerformance({ days });
  const list = order === "bottom"
    ? [...result.restaurants].sort((a, b) => a.score - b.score)
    : result.restaurants;
  return {
    restaurants: list.slice(0, Math.min(Number(limit) || 10, 50)),
    total: result.restaurants.length,
    order,
    days: result.days,
  };
};

// ── Incident Center ──────────────────────────────────────────────────────────
const INCIDENT_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true } },
  resolvedBy: { select: { id: true, name: true, email: true } },
};

export const listIncidents = async ({ status, page = 1, limit = 50 } = {}) => {
  const where = {};
  if (status) where.status = status;
  const take = Math.min(Number(limit) || 50, 100);
  const [incidents, total] = await prisma.$transaction([
    prisma.incident.findMany({
      where,
      include: INCIDENT_INCLUDE,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (Number(page) - 1) * take,
      take,
    }),
    prisma.incident.count({ where }),
  ]);
  return { incidents, total, page: Number(page), pages: Math.ceil(total / take) };
};

// Append an entry to an incident's timeline. Never throws — timeline logging
// must not break the operation it records.
async function logIncidentEvent({ incidentId, type, message = null, actorId = null }) {
  try {
    await prisma.incidentEvent.create({ data: { incidentId, type, message, actorId } });
  } catch (err) {
    logger.error("Failed to log incident event", { incidentId, type, error: err.message });
  }
}

export const listIncidentEvents = async (incidentId) => {
  const events = await prisma.incidentEvent.findMany({
    where: { incidentId },
    orderBy: { createdAt: "asc" },
  });
  return { events };
};

// Notifies every admin in-app, and emails them for HIGH/CRITICAL incidents.
async function notifyAdmins({ title, message, severity, entityId, email = null }) {
  const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } }, select: { id: true, name: true, email: true } });
  await Promise.allSettled(
    admins.map((a) => createNotification({ userId: a.id, title, body: message, type: "OPS_INCIDENT", entityId })),
  );
  const wantEmail = email ?? (severity === "HIGH" || severity === "CRITICAL");
  if (wantEmail) {
    await Promise.allSettled(
      admins.map((a) => sendAdminAlertEmail({ to: a.email, name: a.name, subject: title, message, severity })),
    );
  }
}

export const createIncident = async ({ title, description, severity = "MEDIUM", category, entityType, entityId, createdById = null }) => {
  if (!title || !title.trim()) throw new AppError("Incident title is required", 400);
  if (title.trim().length > 200) throw new AppError("Incident title cannot exceed 200 characters", 400);
  if (description && String(description).length > 2000) throw new AppError("Incident description cannot exceed 2000 characters", 400);
  const validSeverity = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  if (!validSeverity.includes(severity)) throw new AppError("Invalid severity", 400);

  const incident = await prisma.incident.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      severity,
      category: category || null,
      entityType: entityType || null,
      entityId: entityId || null,
      createdById,
      lastNotifiedAt: new Date(),
    },
    include: INCIDENT_INCLUDE,
  });

  await logIncidentEvent({ incidentId: incident.id, type: "CREATED", message: `Created (${severity})${createdById ? "" : " by system"}`, actorId: createdById });

  try {
    await notifyAdmins({ title: `Incident: ${incident.title}`, message: incident.description ?? incident.title, severity, entityId: incident.id });
  } catch (err) {
    logger.error("Incident notification failed", { incidentId: incident.id, error: err.message });
  }

  logger.warn("Ops incident created", { incidentId: incident.id, severity, createdById });
  return incident;
};

export const updateIncident = async (id, { severity, status }) => {
  const data = {};
  if (severity) {
    if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)) throw new AppError("Invalid severity", 400);
    data.severity = severity;
  }
  if (status) {
    if (!["OPEN", "ACKNOWLEDGED", "RESOLVED"].includes(status)) throw new AppError("Invalid status", 400);
    data.status = status;
  }
  if (Object.keys(data).length === 0) throw new AppError("Nothing to update", 400);

  let updated;
  try {
    updated = await prisma.incident.update({ where: { id }, data, include: INCIDENT_INCLUDE });
  } catch {
    throw new AppError("Incident not found", 404);
  }
  if (severity) await logIncidentEvent({ incidentId: id, type: "SEVERITY_CHANGED", message: `Severity set to ${severity}` });
  if (status) await logIncidentEvent({ incidentId: id, type: "STATUS_CHANGED", message: `Status set to ${status}` });
  return updated;
};

export const acknowledgeIncident = async (id, actorId) => {
  let updated;
  try {
    updated = await prisma.incident.update({
      where: { id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date() },
      include: INCIDENT_INCLUDE,
    });
  } catch {
    throw new AppError("Incident not found", 404);
  }
  await logIncidentEvent({ incidentId: id, type: "ACKNOWLEDGED", message: "Acknowledged", actorId });
  return updated;
};

export const resolveIncident = async (id, resolvedById) => {
  let updated;
  try {
    updated = await prisma.incident.update({
      where: { id },
      data: { status: "RESOLVED", resolvedById, resolvedAt: new Date() },
      include: INCIDENT_INCLUDE,
    });
  } catch {
    throw new AppError("Incident not found", 404);
  }
  await logIncidentEvent({ incidentId: id, type: "RESOLVED", message: "Resolved", actorId: resolvedById });
  return updated;
};

// ── Auto-incident creation + dedup (Phase 1) ──────────────────────────────────
// Raises incidents from the live snapshot. An OPEN incident with the same
// (category, entityId) is reused — severity is escalated up if the live signal
// is now worse, otherwise it is left untouched. Returns a small summary.
export const runAutoIncidents = async (now = new Date()) => {
  const snapshot = await gatherOpsSnapshot();
  const candidates = computeAutoIncidents(snapshot, now);
  if (candidates.length === 0) return { created: 0, escalated: 0 };

  const openExisting = await prisma.incident.findMany({
    where: {
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
      category: { in: [...new Set(candidates.map((c) => c.category))] },
      entityId: { in: [...new Set(candidates.map((c) => c.entityId))] },
    },
    select: { id: true, category: true, entityId: true, severity: true },
  });
  const byKey = new Map(openExisting.map((i) => [`${i.category}:${i.entityId}`, i]));

  let created = 0;
  let escalated = 0;
  for (const c of candidates) {
    const existing = byKey.get(`${c.category}:${c.entityId}`);
    if (!existing) {
      await createIncident({ title: c.title, severity: c.severity, category: c.category, entityType: c.entityType, entityId: c.entityId });
      created += 1;
    } else {
      const bumped = maxSeverity(existing.severity, c.severity);
      if (bumped !== existing.severity) {
        await prisma.incident.update({ where: { id: existing.id }, data: { severity: bumped, updatedAt: new Date() } });
        await logIncidentEvent({ incidentId: existing.id, type: "SEVERITY_CHANGED", message: `Severity raised to ${bumped} (live signal worsened)` });
        escalated += 1;
      } else {
        // Keep the incident fresh so resolution logic sees it is still active.
        await prisma.incident.update({ where: { id: existing.id }, data: { updatedAt: new Date() } });
      }
    }
  }
  return { created, escalated };
};

// ── Escalation engine (Phase 2) ───────────────────────────────────────────────
// Periodically re-evaluates OPEN incidents: ages them up in severity, re-notifies
// at 2h, emails at 3h, with a 2h notification-dedup window.
export const runEscalations = async (now = new Date()) => {
  const open = await prisma.incident.findMany({
    where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    include: INCIDENT_INCLUDE,
  });

  let escalated = 0;
  let renotified = 0;
  for (const inc of open) {
    const { severity, renotify, email } = nextEscalation(inc, now);
    const data = {};
    if (severity && severity !== inc.severity) {
      data.severity = severity;
      data.escalatedAt = now;
      data.escalationCount = (inc.escalationCount ?? 0) + 1;
    }
    if (renotify || email) data.lastNotifiedAt = now;

    if (Object.keys(data).length === 0) continue;

    await prisma.incident.update({ where: { id: inc.id }, data });

    if (data.severity) {
      await logIncidentEvent({ incidentId: inc.id, type: "ESCALATED", message: `Auto-escalated to ${severity} after ${Math.round((now - new Date(inc.createdAt)) / 60000)} min` });
      escalated += 1;
    }
    if (renotify || email) {
      await logIncidentEvent({ incidentId: inc.id, type: "NOTIFIED", message: email ? "Re-notified admins (email escalation)" : "Re-notified admins" });
      try {
        await notifyAdmins({ title: `Incident still open: ${inc.title}`, message: inc.description ?? inc.title, severity: data.severity ?? inc.severity, entityId: inc.id, email });
      } catch (err) {
        logger.error("Escalation notification failed", { incidentId: inc.id, error: err.message });
      }
      renotified += 1;
    }
  }
  return { escalated, renotified };
};

export { OPS_THRESHOLDS };
