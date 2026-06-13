/**
 * Operations Intelligence test suite — pure logic + service orchestration.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("../config/prisma.js", () => ({
  prisma: {
    riderLocation: { findMany: vi.fn() },
    order: { findMany: vi.fn(), groupBy: vi.fn() },
    restaurant: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    incident: { findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    incidentEvent: { create: vi.fn().mockResolvedValue({}), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../utils/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../modules/notification/notification.service.js", () => ({ createNotification: vi.fn().mockResolvedValue({}) }));
vi.mock("../services/email.service.js", () => ({ sendAdminAlertEmail: vi.fn().mockResolvedValue(undefined) }));

const logic = await import("../modules/ops/ops.logic.js");
const ops = await import("../modules/ops/ops.service.js");
const { prisma } = await import("../config/prisma.js");
const { createNotification } = await import("../modules/notification/notification.service.js");
const { sendAdminAlertEmail } = await import("../services/email.service.js");

const NOW = new Date("2026-06-14T12:00:00.000Z");
const minsAgo = (m) => new Date(NOW.getTime() - m * 60000);

// ── Pure logic: fleet alerts ────────────────────────────────────────────────────
describe("computeFleetAlerts", () => {
  it("flags a rider offline > 10 min (CRITICAL when on an active delivery)", () => {
    const alerts = logic.computeFleetAlerts(
      { riders: [{ id: "d1", name: "Ravi", lastSeenAt: minsAgo(12), activeDeliveries: 1 }] },
      NOW,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: "RIDER_OFFLINE", severity: "CRITICAL", entityId: "d1" });
  });

  it("does not flag a rider seen recently", () => {
    const alerts = logic.computeFleetAlerts({ riders: [{ id: "d1", name: "Ravi", lastSeenAt: minsAgo(3), activeDeliveries: 0 }] }, NOW);
    expect(alerts).toHaveLength(0);
  });

  it("flags a delivery past its ETA", () => {
    const alerts = logic.computeFleetAlerts(
      { activeOrders: [{ id: "o1", orderNumber: "ABC123", estimatedDelivery: minsAgo(20) }] },
      NOW,
    );
    expect(alerts[0]).toMatchObject({ type: "DELIVERY_DELAYED", severity: "HIGH", entityId: "o1" });
  });

  it("flags an order stuck > 30 min that isn't out for delivery", () => {
    const alerts = logic.computeFleetAlerts(
      { openOrders: [{ id: "o2", orderNumber: "XYZ999", status: "PREPARING", placedAt: minsAgo(40), restaurant: { name: "Pizza" } }] },
      NOW,
    );
    expect(alerts[0]).toMatchObject({ type: "ORDER_STUCK", severity: "HIGH", entityId: "o2" });
  });

  it("ignores out-for-delivery / delivered orders in the stuck check", () => {
    const alerts = logic.computeFleetAlerts(
      { openOrders: [{ id: "o3", orderNumber: "Q", status: "OUT_FOR_DELIVERY", placedAt: minsAgo(99) }] },
      NOW,
    );
    expect(alerts).toHaveLength(0);
  });

  it("flags an overloaded restaurant at the threshold", () => {
    const alerts = logic.computeFleetAlerts({ restaurants: [{ id: "r1", name: "Busy", activeOrders: 10 }] }, NOW);
    expect(alerts[0]).toMatchObject({ type: "RESTAURANT_OVERLOADED", entityId: "r1" });
  });

  it("sorts most severe first", () => {
    const alerts = logic.computeFleetAlerts(
      {
        restaurants: [{ id: "r1", name: "Busy", activeOrders: 12 }], // MEDIUM
        riders: [{ id: "d1", name: "R", lastSeenAt: minsAgo(20), activeDeliveries: 2 }], // CRITICAL
      },
      NOW,
    );
    expect(alerts[0].severity).toBe("CRITICAL");
  });
});

// ── Pure logic: SLA ─────────────────────────────────────────────────────────────
describe("computeSlaSummary", () => {
  it("splits on-time vs delayed and averages lateness", () => {
    const sla = logic.computeSlaSummary([
      { deliveredAt: NOW, estimatedDelivery: minsAgo(5) }, // delivered 5 min after ETA → late 5
      { deliveredAt: NOW, estimatedDelivery: minsAgo(10) }, // delivered 10 min after ETA → late 10
      { deliveredAt: minsAgo(10), estimatedDelivery: NOW }, // delivered 10 min before ETA → on time
    ]);
    expect(sla.measuredOrders).toBe(3);
    expect(sla.delayed).toBe(2);
    expect(sla.onTime).toBe(1);
    expect(sla.avgLatenessMin).toBe(8); // (5+10)/2 = 7.5 → 8
  });

  it("returns null on-time rate with no measured orders", () => {
    expect(logic.computeSlaSummary([]).onTimeRate).toBeNull();
  });
});

// ── Pure logic: performance ─────────────────────────────────────────────────────
describe("computeRiderPerformance", () => {
  it("computes deliveries, avg time, cancellation rate and distance", () => {
    const dist = () => 5000; // 5km per delivery (injected)
    const out = logic.computeRiderPerformance(
      [
        { agentId: "d1", status: "DELIVERED", placedAt: minsAgo(40), deliveredAt: minsAgo(10), restaurant: { lat: 1, lng: 1 }, deliveryAddress: { lat: 2, lng: 2 } },
        { agentId: "d1", status: "CANCELLED", placedAt: minsAgo(40), deliveredAt: null },
      ],
      [{ id: "d1", name: "Ravi" }],
      dist,
    );
    expect(out[0]).toMatchObject({ riderId: "d1", deliveries: 1, avgDeliveryMin: 30, cancellationRate: 50, distanceKm: 5 });
  });
});

describe("computeRestaurantPerformance", () => {
  it("sums delivered revenue (paise) and order volume", () => {
    const out = logic.computeRestaurantPerformance(
      [
        { restaurantId: "r1", status: "DELIVERED", total: 45000 },
        { restaurantId: "r1", status: "CANCELLED", total: 10000 },
        { restaurantId: "r1", status: "DELIVERED", total: 5000 },
      ],
      [{ id: "r1", name: "Pizza", rating: 4.4 }],
    );
    expect(out[0]).toMatchObject({ restaurantId: "r1", revenuePaise: 50000, orderVolume: 3, deliveredOrders: 2 });
  });
});

// ── Service: incident CRUD + notifications ───────────────────────────────────────
describe("ops.service incidents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([
      { id: "a1", name: "Admin One", email: "a1@gk.dev" },
      { id: "a2", name: "Admin Two", email: "a2@gk.dev" },
    ]);
    prisma.incident.create.mockImplementation(({ data }) => Promise.resolve({ id: "inc-1", ...data, createdBy: {}, resolvedBy: null }));
    prisma.incident.update.mockResolvedValue({ id: "inc-1", status: "RESOLVED" });
  });

  it("rejects an incident with no title", async () => {
    await expect(ops.createIncident({ title: "  ", createdById: "a1" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects an invalid severity", async () => {
    await expect(ops.createIncident({ title: "X", severity: "BOGUS", createdById: "a1" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("creates an incident and notifies every admin in-app", async () => {
    await ops.createIncident({ title: "Rider down", severity: "MEDIUM", createdById: "a1" });
    expect(prisma.incident.create).toHaveBeenCalledOnce();
    expect(createNotification).toHaveBeenCalledTimes(2); // one per admin
    expect(sendAdminAlertEmail).not.toHaveBeenCalled(); // MEDIUM → no email
  });

  it("emails admins for HIGH/CRITICAL incidents", async () => {
    await ops.createIncident({ title: "Outage", severity: "CRITICAL", createdById: "a1" });
    expect(sendAdminAlertEmail).toHaveBeenCalledTimes(2);
  });

  it("still creates the incident if notifications throw", async () => {
    createNotification.mockRejectedValueOnce(new Error("socket down"));
    const inc = await ops.createIncident({ title: "Resilient", severity: "LOW", createdById: "a1" });
    expect(inc.id).toBe("inc-1");
  });

  it("resolveIncident sets RESOLVED with resolver + timestamp", async () => {
    await ops.resolveIncident("inc-1", "a2");
    expect(prisma.incident.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inc-1" }, data: expect.objectContaining({ status: "RESOLVED", resolvedById: "a2" }) }),
    );
  });

  it("resolveIncident throws 404 when the incident is missing", async () => {
    prisma.incident.update.mockRejectedValueOnce(new Error("not found"));
    await expect(ops.resolveIncident("ghost", "a1")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("updateIncident rejects an empty patch", async () => {
    await expect(ops.updateIncident("inc-1", {})).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── Service: SLA orchestration ───────────────────────────────────────────────────
describe("ops.service getSlaSummary", () => {
  it("returns SLA stats with the window", async () => {
    prisma.order.findMany.mockResolvedValue([
      { deliveredAt: minsAgo(0), estimatedDelivery: minsAgo(5) },
    ]);
    const sla = await ops.getSlaSummary({ days: 7 });
    expect(sla).toMatchObject({ measuredOrders: 1, delayed: 1, days: 7 });
  });
});

// ── Service: fleet alerts orchestration ──────────────────────────────────────────
describe("ops.service getFleetAlerts", () => {
  // The service computes alerts against the real clock, so use real-relative times.
  const ago = (m) => new Date(Date.now() - m * 60000);
  it("assembles alerts from riders, orders and restaurants", async () => {
    prisma.riderLocation.findMany.mockResolvedValue([
      { riderId: "d1", lastSeenAt: ago(20), rider: { name: "Ravi" } },
    ]);
    prisma.order.findMany
      .mockResolvedValueOnce([{ id: "o1", estimatedDelivery: ago(20), agentId: "d1" }]) // active (OUT_FOR_DELIVERY)
      .mockResolvedValueOnce([{ id: "o2", status: "PREPARING", placedAt: ago(40), restaurant: { name: "Pizza" } }]); // open
    prisma.order.groupBy.mockResolvedValue([{ restaurantId: "r1", _count: { id: 11 } }]);
    prisma.restaurant.findMany.mockResolvedValue([{ id: "r1", name: "Busy" }]);

    const alerts = await ops.getFleetAlerts();
    const types = alerts.map((a) => a.type);
    expect(types).toContain("RIDER_OFFLINE");
    expect(types).toContain("DELIVERY_DELAYED");
    expect(types).toContain("ORDER_STUCK");
    expect(types).toContain("RESTAURANT_OVERLOADED");
  });
});

// ── Service: performance orchestration ───────────────────────────────────────────
describe("ops.service performance", () => {
  it("getRiderPerformance shapes orders and returns rows", async () => {
    prisma.order.findMany.mockResolvedValue([
      { agentId: "d1", status: "DELIVERED", placedAt: minsAgo(40), deliveredAt: minsAgo(10), deliveryAddress: { lat: 2, lng: 2 }, restaurant: { lat: 1, lng: 1 } },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: "d1", name: "Ravi" }]);
    const out = await ops.getRiderPerformance({ days: 7 });
    expect(out.days).toBe(7);
    expect(out.riders[0]).toMatchObject({ riderId: "d1", deliveries: 1 });
  });

  it("getRestaurantPerformance returns revenue rows", async () => {
    prisma.order.findMany.mockResolvedValue([{ restaurantId: "r1", status: "DELIVERED", total: 45000 }]);
    prisma.restaurant.findMany.mockResolvedValue([{ id: "r1", name: "Pizza", rating: 4.5 }]);
    const out = await ops.getRestaurantPerformance({ days: 7 });
    expect(out.restaurants[0]).toMatchObject({ restaurantId: "r1", revenuePaise: 45000 });
  });
});

// ── Pure logic: auto-incidents + escalation ──────────────────────────────────────
describe("computeAutoIncidents", () => {
  it("raises HIGH/CRITICAL for overloaded restaurants at the right thresholds", () => {
    const out = logic.computeAutoIncidents({ restaurants: [
      { id: "r1", name: "A", activeOrders: 25 },
      { id: "r2", name: "B", activeOrders: 40 },
      { id: "r3", name: "C", activeOrders: 5 },
    ] }, NOW);
    expect(out.find((c) => c.entityId === "r1")).toMatchObject({ severity: "HIGH", category: "RESTAURANT_OVERLOADED" });
    expect(out.find((c) => c.entityId === "r2")).toMatchObject({ severity: "CRITICAL" });
    expect(out.find((c) => c.entityId === "r3")).toBeUndefined();
  });

  it("only raises rider-offline when an active delivery exists", () => {
    const out = logic.computeAutoIncidents({ riders: [
      { id: "d1", name: "R1", lastSeenAt: minsAgo(20), activeDeliveries: 1 },
      { id: "d2", name: "R2", lastSeenAt: minsAgo(20), activeDeliveries: 0 },
    ] }, NOW);
    expect(out.map((c) => c.entityId)).toEqual(["d1"]);
  });

  it("escalates a delivery to CRITICAL past 30 min late", () => {
    const out = logic.computeAutoIncidents({ activeOrders: [{ id: "o1", orderNumber: "A1", estimatedDelivery: minsAgo(31) }] }, NOW);
    expect(out[0]).toMatchObject({ category: "DELIVERY_DELAYED", severity: "CRITICAL" });
  });

  it("raises an incident for an order stuck > 45 min", () => {
    const out = logic.computeAutoIncidents({ openOrders: [{ id: "o2", orderNumber: "A2", status: "PREPARING", placedAt: minsAgo(50) }] }, NOW);
    expect(out[0]).toMatchObject({ category: "ORDER_STUCK", severity: "HIGH" });
  });
});

describe("nextEscalation + maxSeverity", () => {
  it("maxSeverity returns the higher severity", () => {
    expect(logic.maxSeverity("HIGH", "LOW")).toBe("HIGH");
    expect(logic.maxSeverity("MEDIUM", "CRITICAL")).toBe("CRITICAL");
  });
  it("bumps LOW→MEDIUM after 30 min", () => {
    expect(logic.nextEscalation({ severity: "LOW", createdAt: minsAgo(31), lastNotifiedAt: null }, NOW).severity).toBe("MEDIUM");
  });
  it("bumps HIGH→CRITICAL after 60 min", () => {
    expect(logic.nextEscalation({ severity: "HIGH", createdAt: minsAgo(61), lastNotifiedAt: null }, NOW).severity).toBe("CRITICAL");
  });
  it("renotifies after 120 min when not recently notified", () => {
    const r = logic.nextEscalation({ severity: "CRITICAL", createdAt: minsAgo(130), lastNotifiedAt: null }, NOW);
    expect(r.renotify).toBe(true);
  });
  it("emails after 180 min", () => {
    const r = logic.nextEscalation({ severity: "CRITICAL", createdAt: minsAgo(190), lastNotifiedAt: null }, NOW);
    expect(r.email).toBe(true);
  });
  it("suppresses renotify within the 2h dedup window", () => {
    const r = logic.nextEscalation({ severity: "CRITICAL", createdAt: minsAgo(200), lastNotifiedAt: minsAgo(10) }, NOW);
    expect(r.renotify).toBe(false);
  });
});

// ── Service: auto-incident engine + dedup ────────────────────────────────────────
describe("ops.service runAutoIncidents", () => {
  const ago = (m) => new Date(Date.now() - m * 60000);
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.incidentEvent.create.mockResolvedValue({});
    prisma.riderLocation.findMany.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]); // active + open empty
    prisma.order.groupBy.mockResolvedValue([{ restaurantId: "r1", _count: { id: 25 } }]); // HIGH overload
    prisma.restaurant.findMany.mockResolvedValue([{ id: "r1", name: "Busy" }]);
    prisma.user.findMany.mockResolvedValue([]); // admins for notify
  });

  it("creates an incident for a fresh candidate", async () => {
    prisma.incident.findMany.mockResolvedValue([]); // no existing
    prisma.incident.create.mockResolvedValue({ id: "inc-1", title: "x", severity: "HIGH" });
    const out = await ops.runAutoIncidents(ago(0));
    expect(out.created).toBe(1);
    expect(prisma.incident.create).toHaveBeenCalled();
  });

  it("deduplicates: escalates an existing OPEN incident instead of creating", async () => {
    prisma.order.groupBy.mockResolvedValue([{ restaurantId: "r1", _count: { id: 40 } }]); // CRITICAL now
    prisma.incident.findMany.mockResolvedValue([{ id: "inc-1", category: "RESTAURANT_OVERLOADED", entityId: "r1", severity: "HIGH" }]);
    prisma.incident.update.mockResolvedValue({});
    const out = await ops.runAutoIncidents(ago(0));
    expect(out.created).toBe(0);
    expect(out.escalated).toBe(1);
    expect(prisma.incident.create).not.toHaveBeenCalled();
    expect(prisma.incident.update).toHaveBeenCalled();
  });

  it("does not downgrade when the live signal is no worse", async () => {
    prisma.incident.findMany.mockResolvedValue([{ id: "inc-1", category: "RESTAURANT_OVERLOADED", entityId: "r1", severity: "CRITICAL" }]);
    prisma.incident.update.mockResolvedValue({});
    const out = await ops.runAutoIncidents(ago(0));
    expect(out.escalated).toBe(0); // candidate HIGH < existing CRITICAL → only a freshness touch
  });
});

describe("ops.service runEscalations / acknowledge / events", () => {
  const ago = (m) => new Date(Date.now() - m * 60000);
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.incidentEvent.create.mockResolvedValue({});
    prisma.user.findMany.mockResolvedValue([{ id: "a1", name: "Admin", email: "a@gk.dev" }]);
  });

  it("escalates an aged OPEN incident", async () => {
    prisma.incident.findMany.mockResolvedValue([{ id: "inc-1", title: "x", severity: "LOW", status: "OPEN", createdAt: ago(40), escalationCount: 0, lastNotifiedAt: null }]);
    prisma.incident.update.mockResolvedValue({});
    const out = await ops.runEscalations(new Date());
    expect(out.escalated).toBe(1);
    expect(prisma.incident.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ severity: "MEDIUM" }) }));
  });

  it("re-notifies a long-open incident", async () => {
    prisma.incident.findMany.mockResolvedValue([{ id: "inc-1", title: "x", severity: "CRITICAL", status: "OPEN", createdAt: ago(130), escalationCount: 1, lastNotifiedAt: null }]);
    prisma.incident.update.mockResolvedValue({});
    const out = await ops.runEscalations(new Date());
    expect(out.renotified).toBe(1);
  });

  it("acknowledgeIncident sets ACKNOWLEDGED + logs an event", async () => {
    prisma.incident.update.mockResolvedValue({ id: "inc-1", status: "ACKNOWLEDGED" });
    const out = await ops.acknowledgeIncident("inc-1", "a1");
    expect(out.status).toBe("ACKNOWLEDGED");
    expect(prisma.incidentEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "ACKNOWLEDGED" }) }));
  });

  it("listIncidentEvents returns the timeline", async () => {
    prisma.incidentEvent.findMany.mockResolvedValue([{ id: "e1", type: "CREATED" }]);
    const out = await ops.listIncidentEvents("inc-1");
    expect(out.events).toHaveLength(1);
  });
});

// ── Service: incident listing + update ───────────────────────────────────────────
describe("ops.service listIncidents / updateIncident", () => {
  it("listIncidents paginates via $transaction", async () => {
    prisma.$transaction.mockResolvedValue([[{ id: "inc-1" }], 1]);
    const out = await ops.listIncidents({ status: "OPEN", page: 1, limit: 50 });
    expect(out).toMatchObject({ total: 1, page: 1, pages: 1 });
    expect(out.incidents).toHaveLength(1);
  });

  it("updateIncident applies a valid severity change", async () => {
    prisma.incident.update.mockResolvedValue({ id: "inc-1", severity: "CRITICAL" });
    const out = await ops.updateIncident("inc-1", { severity: "CRITICAL" });
    expect(out.severity).toBe("CRITICAL");
  });

  it("updateIncident rejects an invalid status", async () => {
    await expect(ops.updateIncident("inc-1", { status: "BOGUS" })).rejects.toMatchObject({ statusCode: 400 });
  });
});
