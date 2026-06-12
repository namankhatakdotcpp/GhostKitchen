import { prisma } from "../../config/prisma.js";
import { emitToAll } from "../../socket/socketServer.js";
import { sendMaintenanceEmail } from "../../services/email.service.js";
import { logger } from "../../utils/logger.js";

// In-process cache — avoids a DB round-trip on every request for maintenance check
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL = 30_000; // 30 seconds

export async function getSiteConfig() {
  return prisma.siteConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
}

export async function getSiteConfigCached() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL) return _cache;
  _cache = await getSiteConfig();
  _cacheAt = now;
  return _cache;
}

export function invalidateConfigCache() {
  _cache = null;
  _cacheAt = 0;
}

export async function updateSiteConfig(data) {
  const allowed = [
    "maintenanceMode", "maintenanceReason", "maintenanceScheduledAt", "maintenanceEndsAt",
    "newRestaurantReg", "riderRegistrations",
    "cashOnDelivery", "codMinOrder", "maxDeliveryRadius", "defaultDeliveryFee",
    "requireApproval", "allowBranches", "maxMenuItems", "requireEmailVerify",
    "autoConfirmOrders",
  ];
  const safe = {};
  for (const key of allowed) {
    if (key in data) safe[key] = data[key];
  }
  const result = await prisma.siteConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...safe },
    update: safe,
  });
  invalidateConfigCache();
  return result;
}

// Resolves scheduled maintenance transitions. Called by the maintenance middleware
// on each request so no external cron job is required.
export async function applyMaintenanceSchedule(cfg) {
  const now = new Date();
  let changed = false;
  const patch = {};

  // Auto-activate when scheduled time has arrived
  if (!cfg.maintenanceMode && cfg.maintenanceScheduledAt && now >= new Date(cfg.maintenanceScheduledAt)) {
    patch.maintenanceMode = true;
    patch.maintenanceScheduledAt = null;
    changed = true;
  }

  // Auto-deactivate when window has elapsed
  if (cfg.maintenanceMode && cfg.maintenanceEndsAt && now >= new Date(cfg.maintenanceEndsAt)) {
    patch.maintenanceMode = false;
    patch.maintenanceEndsAt = null;
    changed = true;
  }

  if (!changed) return cfg;
  const updated = await updateSiteConfig(patch);

  if (patch.maintenanceMode === true) {
    emitToAll("maintenance:started", { reason: updated.maintenanceReason, endsAt: updated.maintenanceEndsAt });
  } else if (patch.maintenanceMode === false) {
    emitToAll("maintenance:ended", {});
  }

  return updated;
}

// Broadcasts in-app notifications to all users about upcoming/active maintenance.
// Fire-and-forget — caller must NOT await this in the request cycle.
export async function broadcastMaintenanceNotification(cfg) {
  try {
    // Cap at 10 000 to avoid OOM — at higher scale use a background job queue
    const users = await prisma.user.findMany({ select: { id: true, email: true, name: true }, take: 10_000 });
    if (users.length === 0) return;

    const isScheduled = !!cfg.maintenanceScheduledAt;
    const startAt = isScheduled ? new Date(cfg.maintenanceScheduledAt) : new Date();
    const endsAt = cfg.maintenanceEndsAt ? new Date(cfg.maintenanceEndsAt) : null;

    const formatTime = (d) =>
      d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) +
      ", " +
      d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

    let body = cfg.maintenanceReason
      ? `Reason: ${cfg.maintenanceReason}. `
      : "";
    body += isScheduled
      ? `Scheduled to begin at ${formatTime(startAt)}.`
      : "Maintenance has started.";
    if (endsAt) body += ` Expected to end at ${formatTime(endsAt)}.`;

    const title = isScheduled
      ? "Scheduled Maintenance"
      : "Platform Maintenance";

    // Replace any previous maintenance notifications so users aren't spammed
    await prisma.notification.deleteMany({
      where: { type: "MAINTENANCE", entityId: "maintenance" },
    });

    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        title,
        body,
        type: "MAINTENANCE",
        entityId: "maintenance",
        isRead: false,
      })),
    });

    // Real-time socket push to all connected clients
    const socketEvent = isScheduled ? "maintenance:scheduled" : "maintenance:started";
    emitToAll(socketEvent, {
      title,
      body,
      reason: cfg.maintenanceReason,
      scheduledAt: cfg.maintenanceScheduledAt,
      endsAt: cfg.maintenanceEndsAt,
    });

    // Send email to all users with addresses — fire-and-forget, no await
    for (const u of users) {
      if (u.email) {
        sendMaintenanceEmail({
          to: u.email,
          name: u.name,
          reason: cfg.maintenanceReason,
          scheduledAt: cfg.maintenanceScheduledAt,
          endsAt: cfg.maintenanceEndsAt,
        }).catch(() => {});
      }
    }
  } catch (err) {
    logger.error("[Maintenance] Notification broadcast failed", { error: err.message });
  }
}

export async function cancelMaintenanceSchedule() {
  const updated = await updateSiteConfig({ maintenanceScheduledAt: null, maintenanceEndsAt: null });
  emitToAll("maintenance:cancelled", {});
  return updated;
}
