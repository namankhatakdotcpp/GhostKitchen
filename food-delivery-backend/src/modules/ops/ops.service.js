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

// ── Fleet alerts (live, computed — no persistence) ───────────────────────────
export const getFleetAlerts = async () => {
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

  // Active-delivery counts per rider (for severity escalation).
  const activeByRider = new Map();
  for (const o of activeOrders) {
    if (o.agentId) activeByRider.set(o.agentId, (activeByRider.get(o.agentId) ?? 0) + 1);
  }

  const restaurantIds = restaurantCounts.map((r) => r.restaurantId);
  const restaurants = restaurantIds.length
    ? await prisma.restaurant.findMany({ where: { id: { in: restaurantIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(restaurants.map((r) => [r.id, r.name]));

  return computeFleetAlerts({
    riders: riderLocations.map((l) => ({
      id: l.riderId,
      name: l.rider?.name ?? "Rider",
      lastSeenAt: l.lastSeenAt,
      activeDeliveries: activeByRider.get(l.riderId) ?? 0,
    })),
    activeOrders: activeOrders.map((o) => ({ id: o.id, orderNumber: o.id.slice(-6).toUpperCase(), estimatedDelivery: o.estimatedDelivery })),
    openOrders: openOrders.map((o) => ({ id: o.id, orderNumber: o.id.slice(-6).toUpperCase(), status: o.status, placedAt: o.placedAt, restaurant: o.restaurant })),
    restaurants: restaurantCounts.map((r) => ({ id: r.restaurantId, name: nameById.get(r.restaurantId) ?? "Restaurant", activeOrders: r._count.id })),
  });
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

// Notifies every admin in-app, and emails them for HIGH/CRITICAL incidents.
async function notifyAdmins({ title, message, severity, entityId }) {
  const admins = await prisma.user.findMany({ where: { roles: { has: "ADMIN" } }, select: { id: true, name: true, email: true } });
  await Promise.allSettled(
    admins.map((a) => createNotification({ userId: a.id, title, body: message, type: "OPS_INCIDENT", entityId })),
  );
  if (severity === "HIGH" || severity === "CRITICAL") {
    await Promise.allSettled(
      admins.map((a) => sendAdminAlertEmail({ to: a.email, name: a.name, subject: title, message, severity })),
    );
  }
}

export const createIncident = async ({ title, description, severity = "MEDIUM", category, entityType, entityId, createdById }) => {
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
    },
    include: INCIDENT_INCLUDE,
  });

  // Fan out alerts but never let a notification failure fail incident creation.
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

  try {
    return await prisma.incident.update({ where: { id }, data, include: INCIDENT_INCLUDE });
  } catch {
    throw new AppError("Incident not found", 404);
  }
};

export const resolveIncident = async (id, resolvedById) => {
  try {
    return await prisma.incident.update({
      where: { id },
      data: { status: "RESOLVED", resolvedById, resolvedAt: new Date() },
      include: INCIDENT_INCLUDE,
    });
  } catch {
    throw new AppError("Incident not found", 404);
  }
};

export { OPS_THRESHOLDS };
