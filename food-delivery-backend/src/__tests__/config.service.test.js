/**
 * Config service tests
 * Covers: getSiteConfig, getSiteConfigCached, invalidateConfigCache,
 *         updateSiteConfig, applyMaintenanceSchedule, broadcastMaintenanceNotification,
 *         cancelMaintenanceSchedule
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-32-chars-padded-here" },
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config/prisma.js", () => ({
  prisma: {
    siteConfig: { upsert: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));
vi.mock("../socket/socketServer.js", () => ({
  emitToAll: vi.fn(),
  getIO: vi.fn(),
}));
vi.mock("../services/email.service.js", () => ({
  sendMaintenanceEmail: vi.fn().mockResolvedValue(undefined),
}));

const { prisma } = await import("../config/prisma.js");
const { emitToAll } = await import("../socket/socketServer.js");
const {
  getSiteConfig,
  getSiteConfigCached,
  invalidateConfigCache,
  updateSiteConfig,
  applyMaintenanceSchedule,
  broadcastMaintenanceNotification,
  cancelMaintenanceSchedule,
} = await import("../modules/config/config.service.js");

const baseCfg = {
  id: "singleton",
  maintenanceMode: false,
  maintenanceReason: null,
  maintenanceScheduledAt: null,
  maintenanceEndsAt: null,
  newRestaurantReg: true,
  riderRegistrations: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  invalidateConfigCache();
});

// ── getSiteConfig ─────────────────────────────────────────────────────────────
describe("getSiteConfig", () => {
  it("calls prisma.siteConfig.upsert and returns result", async () => {
    prisma.siteConfig.upsert.mockResolvedValue(baseCfg);
    const result = await getSiteConfig();
    expect(result).toEqual(baseCfg);
    expect(prisma.siteConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "singleton" } })
    );
  });
});

// ── getSiteConfigCached ───────────────────────────────────────────────────────
describe("getSiteConfigCached", () => {
  it("hits DB on first call", async () => {
    prisma.siteConfig.upsert.mockResolvedValue(baseCfg);
    await getSiteConfigCached();
    expect(prisma.siteConfig.upsert).toHaveBeenCalledOnce();
  });

  it("uses in-process cache on second call", async () => {
    prisma.siteConfig.upsert.mockResolvedValue(baseCfg);
    await getSiteConfigCached();
    await getSiteConfigCached();
    expect(prisma.siteConfig.upsert).toHaveBeenCalledOnce();
  });

  it("re-fetches after invalidateConfigCache", async () => {
    prisma.siteConfig.upsert.mockResolvedValue(baseCfg);
    await getSiteConfigCached();
    invalidateConfigCache();
    await getSiteConfigCached();
    expect(prisma.siteConfig.upsert).toHaveBeenCalledTimes(2);
  });
});

// ── updateSiteConfig ──────────────────────────────────────────────────────────
describe("updateSiteConfig", () => {
  it("persists only allowed keys", async () => {
    prisma.siteConfig.upsert.mockResolvedValue({ ...baseCfg, cashOnDelivery: true });
    await updateSiteConfig({ cashOnDelivery: true, hackerKey: "evil" });
    const call = prisma.siteConfig.upsert.mock.calls[0][0];
    expect(call.update).toHaveProperty("cashOnDelivery", true);
    expect(call.update).not.toHaveProperty("hackerKey");
  });

  it("invalidates cache after update", async () => {
    prisma.siteConfig.upsert.mockResolvedValue(baseCfg);
    // Prime cache
    await getSiteConfigCached();
    expect(prisma.siteConfig.upsert).toHaveBeenCalledOnce();
    // Update
    await updateSiteConfig({ maintenanceMode: true });
    // Cache should be invalidated — next call hits DB
    prisma.siteConfig.upsert.mockResolvedValue({ ...baseCfg, maintenanceMode: true });
    await getSiteConfigCached();
    expect(prisma.siteConfig.upsert).toHaveBeenCalledTimes(3); // getSiteConfig + updateSiteConfig + getSiteConfigCached
  });
});

// ── applyMaintenanceSchedule ──────────────────────────────────────────────────
describe("applyMaintenanceSchedule", () => {
  it("returns cfg unchanged when no schedule conditions met", async () => {
    const result = await applyMaintenanceSchedule(baseCfg);
    expect(result).toBe(baseCfg);
    expect(prisma.siteConfig.upsert).not.toHaveBeenCalled();
  });

  it("activates maintenance when scheduledAt is in the past", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const cfg = { ...baseCfg, maintenanceScheduledAt: past };
    const updated = { ...baseCfg, maintenanceMode: true, maintenanceScheduledAt: null };
    prisma.siteConfig.upsert.mockResolvedValue(updated);

    const result = await applyMaintenanceSchedule(cfg);
    expect(result.maintenanceMode).toBe(true);
    expect(emitToAll).toHaveBeenCalledWith("maintenance:started", expect.any(Object));
  });

  it("deactivates maintenance when endsAt is in the past", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const cfg = { ...baseCfg, maintenanceMode: true, maintenanceEndsAt: past };
    const updated = { ...baseCfg, maintenanceMode: false, maintenanceEndsAt: null };
    prisma.siteConfig.upsert.mockResolvedValue(updated);

    const result = await applyMaintenanceSchedule(cfg);
    expect(result.maintenanceMode).toBe(false);
    expect(emitToAll).toHaveBeenCalledWith("maintenance:ended", {});
  });

  it("does not activate when scheduledAt is in the future", async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const cfg = { ...baseCfg, maintenanceScheduledAt: future };
    const result = await applyMaintenanceSchedule(cfg);
    expect(result).toBe(cfg);
    expect(prisma.siteConfig.upsert).not.toHaveBeenCalled();
  });
});

// ── broadcastMaintenanceNotification ─────────────────────────────────────────
describe("broadcastMaintenanceNotification", () => {
  const users = [
    { id: "u-1", email: "a@a.com", name: "Alice" },
    { id: "u-2", email: "b@b.com", name: "Bob" },
  ];

  it("creates per-user notifications and emits socket event", async () => {
    prisma.user.findMany.mockResolvedValue(users);
    prisma.notification.deleteMany.mockResolvedValue({});
    prisma.notification.createMany.mockResolvedValue({ count: 2 });

    await broadcastMaintenanceNotification({ ...baseCfg, maintenanceScheduledAt: null });

    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ userId: "u-1" })]) })
    );
    expect(emitToAll).toHaveBeenCalled();
  });

  it("returns early when no users exist", async () => {
    prisma.user.findMany.mockResolvedValue([]);
    await broadcastMaintenanceNotification(baseCfg);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });

  it("uses 'Scheduled Maintenance' title when scheduledAt is set", async () => {
    prisma.user.findMany.mockResolvedValue(users);
    prisma.notification.deleteMany.mockResolvedValue({});
    prisma.notification.createMany.mockResolvedValue({ count: 2 });

    const future = new Date(Date.now() + 3600_000).toISOString();
    await broadcastMaintenanceNotification({ ...baseCfg, maintenanceScheduledAt: future });

    const call = prisma.notification.createMany.mock.calls[0][0];
    expect(call.data[0].title).toBe("Scheduled Maintenance");
  });

  it("uses 'Platform Maintenance' title when no scheduledAt", async () => {
    prisma.user.findMany.mockResolvedValue(users);
    prisma.notification.deleteMany.mockResolvedValue({});
    prisma.notification.createMany.mockResolvedValue({ count: 2 });

    await broadcastMaintenanceNotification({ ...baseCfg, maintenanceScheduledAt: null });

    const call = prisma.notification.createMany.mock.calls[0][0];
    expect(call.data[0].title).toBe("Platform Maintenance");
  });

  it("does not throw when prisma errors", async () => {
    prisma.user.findMany.mockRejectedValue(new Error("DB down"));
    await expect(broadcastMaintenanceNotification(baseCfg)).resolves.toBeUndefined();
  });

  it("includes endsAt in notification body when provided", async () => {
    prisma.user.findMany.mockResolvedValue(users);
    prisma.notification.deleteMany.mockResolvedValue({});
    prisma.notification.createMany.mockResolvedValue({ count: 2 });

    const endsAt = new Date(Date.now() + 7200_000).toISOString();
    await broadcastMaintenanceNotification({ ...baseCfg, maintenanceEndsAt: endsAt });

    const call = prisma.notification.createMany.mock.calls[0][0];
    expect(call.data[0].body).toContain("Expected to end at");
  });
});

// ── cancelMaintenanceSchedule ─────────────────────────────────────────────────
describe("cancelMaintenanceSchedule", () => {
  it("updates config to null dates and emits socket event", async () => {
    prisma.siteConfig.upsert.mockResolvedValue({ ...baseCfg, maintenanceScheduledAt: null, maintenanceEndsAt: null });
    await cancelMaintenanceSchedule();
    expect(emitToAll).toHaveBeenCalledWith("maintenance:cancelled", {});
  });
});
