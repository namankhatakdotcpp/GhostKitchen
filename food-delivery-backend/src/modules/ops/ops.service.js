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
  computeAutoIncidents,
  nextEscalation,
  maxSeverity,
  OPS_THRESHOLDS,
} from "./ops.logic.js";

const ACTIVE_DELIVERY_STATUSES = ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"];
const OPEN_STATUSES = ["PLACED", "PENDING", "CONFIRMED", "PREPARING"];

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

// ── Rider performance ────────────────────────────────────────────────────────
export const getRiderPerformance = async ({ days = 7 } = {}) => {
  const start = windowStart(days);
  const [orders, riders] = await Promise.all([
    prisma.order.findMany({
      where: { agentId: { not: null }, createdAt: { gte: start } },
      select: {
        agentId: true, status: true, placedAt: true, deliveredAt: true,
        deliveryAddress: true, restaurant: { select: { lat: true, lng: true } },
      },
    }),
    prisma.user.findMany({ where: { roles: { has: "DELIVERY" } }, select: { id: true, name: true } }),
  ]);

  // Normalize restaurant coords onto the order shape the logic expects.
  const shaped = orders.map((o) => ({
    agentId: o.agentId,
    status: o.status,
    placedAt: o.placedAt,
    deliveredAt: o.deliveredAt,
    deliveryAddress: o.deliveryAddress && typeof o.deliveryAddress === "object" ? o.deliveryAddress : null,
    restaurant: o.restaurant,
  }));

  return { riders: computeRiderPerformance(shaped, riders, haversineM), days: Number(days) };
};

// ── Restaurant performance ───────────────────────────────────────────────────
export const getRestaurantPerformance = async ({ days = 7 } = {}) => {
  const start = windowStart(days);
  const [orders, restaurants] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: start } },
      select: { restaurantId: true, status: true, total: true },
    }),
    prisma.restaurant.findMany({ select: { id: true, name: true, rating: true } }),
  ]);
  return { restaurants: computeRestaurantPerformance(orders, restaurants), days: Number(days) };
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
