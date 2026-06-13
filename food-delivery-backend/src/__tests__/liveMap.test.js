/**
 * Live Operations Map test suite
 * Covers: rider status calculation, rider location upsert + broadcast,
 * admin live-map aggregation, and RBAC on both endpoints.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock("../config/prisma.js", () => ({
  prisma: {
    riderLocation: { upsert: vi.fn(), findMany: vi.fn() },
    user: { update: vi.fn() },
    restaurant: { findMany: vi.fn() },
    order: { findMany: vi.fn(), groupBy: vi.fn() },
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Mock the socket layer so service calls don't need a live io instance.
vi.mock("../socket/socket.server.js", () => ({
  emitRiderLocationUpdate: vi.fn(),
  emitOrderStatusUpdated: vi.fn(),
}));

// ── Imports after mocks ───────────────────────────────────────────────────────
const { getRiderStatus, RIDER_STATUS } = await import("../utils/riderStatus.js");
const { updateRiderLocation } = await import("../modules/delivery/delivery.service.js");
const { getLiveMapData } = await import("../modules/admin/admin.service.js");
const { roleMiddleware } = await import("../middlewares/role.middleware.js");
const { prisma } = await import("../config/prisma.js");
const { emitRiderLocationUpdate } = await import("../socket/socket.server.js");

// ── getRiderStatus ─────────────────────────────────────────────────────────────
describe("getRiderStatus", () => {
  const now = new Date("2026-06-13T12:00:00.000Z");

  it("returns OFFLINE when never seen", () => {
    expect(getRiderStatus(null, now)).toBe(RIDER_STATUS.OFFLINE);
    expect(getRiderStatus(undefined, now)).toBe("OFFLINE");
  });

  it("returns ONLINE when seen within 60 seconds", () => {
    expect(getRiderStatus(new Date(now.getTime() - 30 * 1000), now)).toBe("ONLINE");
    expect(getRiderStatus(new Date(now.getTime() - 59 * 1000), now)).toBe("ONLINE");
  });

  it("returns IDLE between 60 seconds and 5 minutes", () => {
    expect(getRiderStatus(new Date(now.getTime() - 90 * 1000), now)).toBe("IDLE");
    expect(getRiderStatus(new Date(now.getTime() - 4 * 60 * 1000), now)).toBe("IDLE");
  });

  it("returns OFFLINE after 5 minutes", () => {
    expect(getRiderStatus(new Date(now.getTime() - 6 * 60 * 1000), now)).toBe("OFFLINE");
  });

  it("treats the 60s and 5min boundaries as the next-tier status", () => {
    expect(getRiderStatus(new Date(now.getTime() - 60 * 1000), now)).toBe("IDLE");
    expect(getRiderStatus(new Date(now.getTime() - 5 * 60 * 1000), now)).toBe("OFFLINE");
  });

  it("treats a future timestamp (clock skew) as ONLINE", () => {
    expect(getRiderStatus(new Date(now.getTime() + 10 * 1000), now)).toBe("ONLINE");
  });

  it("returns OFFLINE for an unparseable value", () => {
    expect(getRiderStatus("not-a-date", now)).toBe("OFFLINE");
  });

  it("accepts ISO strings", () => {
    expect(getRiderStatus(new Date(now.getTime() - 10 * 1000).toISOString(), now)).toBe("ONLINE");
  });
});

// ── updateRiderLocation ─────────────────────────────────────────────────────────
describe("updateRiderLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.riderLocation.upsert.mockResolvedValue({
      id: "loc-1", riderId: "rider-1", latitude: 28.7041, longitude: 77.1025,
      heading: 120, speed: 12, lastSeenAt: new Date(),
    });
    prisma.user.update.mockResolvedValue({ id: "rider-1" });
  });

  it("upserts the location for the authenticated rider and returns a status", async () => {
    const result = await updateRiderLocation("rider-1", { latitude: 28.7041, longitude: 77.1025, heading: 120, speed: 12 });
    expect(result.status).toBe("ONLINE");
    expect(prisma.riderLocation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { riderId: "rider-1" } })
    );
  });

  it("always scopes the upsert to the id it is given (never the body)", async () => {
    await updateRiderLocation("rider-1", { latitude: 1, longitude: 1 });
    const call = prisma.riderLocation.upsert.mock.calls[0][0];
    expect(call.where.riderId).toBe("rider-1");
    expect(call.create.riderId).toBe("rider-1");
  });

  it("mirrors coordinates onto the User row for proximity assignment", async () => {
    await updateRiderLocation("rider-1", { latitude: 28.7041, longitude: 77.1025 });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "rider-1" },
      data: { currentLat: 28.7041, currentLng: 77.1025 },
    });
  });

  it("broadcasts the update to the admin map", async () => {
    await updateRiderLocation("rider-1", { latitude: 28.7041, longitude: 77.1025 });
    expect(emitRiderLocationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ riderId: "rider-1", latitude: 28.7041, longitude: 77.1025, status: "ONLINE" })
    );
  });

  it("rejects an out-of-range latitude with 400 and writes nothing", async () => {
    await expect(updateRiderLocation("rider-1", { latitude: 200, longitude: 77 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.riderLocation.upsert).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range longitude with 400", async () => {
    await expect(updateRiderLocation("rider-1", { latitude: 28, longitude: 999 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects a non-numeric latitude with 400", async () => {
    await expect(updateRiderLocation("rider-1", { latitude: "abc", longitude: 77 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("rejects an invalid heading with 400", async () => {
    await expect(updateRiderLocation("rider-1", { latitude: 28, longitude: 77, heading: 400 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it("allows missing optional heading/speed", async () => {
    await expect(updateRiderLocation("rider-1", { latitude: 28, longitude: 77 })).resolves.toBeTruthy();
  });
});

// ── getLiveMapData ──────────────────────────────────────────────────────────────
describe("getLiveMapData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.restaurant.findMany.mockResolvedValue([
      { id: "r1", name: "Pizza Place", lat: 28.61, lng: 77.20, rating: 4.5, isOpen: true, suspended: false },
      { id: "r2", name: "Closed Diner", lat: 28.62, lng: 77.21, rating: 4.0, isOpen: false, suspended: false },
      { id: "r3", name: "Banned Kitchen", lat: 28.63, lng: 77.22, rating: 3.0, isOpen: true, suspended: true },
    ]);
    prisma.riderLocation.findMany.mockResolvedValue([
      { riderId: "d1", latitude: 28.70, longitude: 77.10, heading: 90, speed: 15, lastSeenAt: new Date(), rider: { id: "d1", name: "Fast Rider" } },
    ]);
    prisma.order.findMany.mockResolvedValue([
      {
        id: "ckorderabc123456", status: "OUT_FOR_DELIVERY", total: 45000, createdAt: new Date(),
        estimatedDelivery: new Date("2026-06-13T12:30:00.000Z"),
        deliveryAddress: { lat: 28.55, lng: 77.05, line1: "Green Park" },
        restaurant: { id: "r1", name: "Pizza Place", lat: 28.61, lng: 77.20 },
        customer: { id: "c1", name: "Alice", phone: "+91999" },
        agent: { id: "d1", name: "Fast Rider", phone: "+91888" },
      },
    ]);
    // groupBy is called 3x in order: activeByRestaurant, todayByRestaurant, activeByRider
    prisma.order.groupBy
      .mockResolvedValueOnce([{ restaurantId: "r1", _count: { id: 12 } }])
      .mockResolvedValueOnce([{ restaurantId: "r1", _count: { id: 30 } }])
      .mockResolvedValueOnce([{ agentId: "d1", _count: { id: 3 } }]);
  });

  it("returns the three top-level collections", async () => {
    const data = await getLiveMapData();
    expect(data).toHaveProperty("restaurants");
    expect(data).toHaveProperty("riders");
    expect(data).toHaveProperty("activeOrders");
  });

  it("maps restaurant coordinates, status and order counts", async () => {
    const { restaurants } = await getLiveMapData();
    const r1 = restaurants.find((r) => r.id === "r1");
    expect(r1).toMatchObject({ latitude: 28.61, longitude: 77.20, status: "OPEN", activeOrders: 12, todaysOrders: 30 });
    expect(restaurants.find((r) => r.id === "r2").status).toBe("CLOSED");
    expect(restaurants.find((r) => r.id === "r3").status).toBe("SUSPENDED");
  });

  it("defaults missing counts to zero", async () => {
    const { restaurants } = await getLiveMapData();
    expect(restaurants.find((r) => r.id === "r2").activeOrders).toBe(0);
  });

  it("maps riders with live status and active delivery counts", async () => {
    const { riders } = await getLiveMapData();
    expect(riders).toHaveLength(1);
    expect(riders[0]).toMatchObject({ id: "d1", name: "Fast Rider", status: "ONLINE", activeDeliveries: 3, latitude: 28.70 });
  });

  it("returns active deliveries with a derived order number and rider coordinates", async () => {
    const { activeOrders } = await getLiveMapData();
    expect(activeOrders).toHaveLength(1);
    expect(activeOrders[0].orderNumber).toBe("123456");
    expect(activeOrders[0].status).toBe("OUT_FOR_DELIVERY");
    expect(activeOrders[0].rider).toMatchObject({ id: "d1", latitude: 28.70, longitude: 77.10 });
    expect(activeOrders[0].customer).toMatchObject({ id: "c1", name: "Alice" });
  });

  it("includes estimatedDelivery and customer drop-off coordinates for route drawing", async () => {
    const { activeOrders } = await getLiveMapData();
    expect(activeOrders[0].estimatedDelivery).toEqual(new Date("2026-06-13T12:30:00.000Z"));
    expect(activeOrders[0].customer).toMatchObject({ latitude: 28.55, longitude: 77.05 });
  });

  it("tolerates a missing/blank delivery address (null drop-off coords)", async () => {
    prisma.order.findMany.mockResolvedValueOnce([
      {
        id: "ckorderxyz999999", status: "OUT_FOR_DELIVERY", total: 20000, createdAt: new Date(),
        estimatedDelivery: null, deliveryAddress: null,
        restaurant: { id: "r1", name: "Pizza Place", lat: 28.61, lng: 77.20 },
        customer: { id: "c2", name: "Bob", phone: "+91777" },
        agent: null,
      },
    ]);
    const { activeOrders } = await getLiveMapData();
    expect(activeOrders[0].customer).toMatchObject({ latitude: null, longitude: null });
    expect(activeOrders[0].rider).toBeNull();
  });

  it("does not leak the customer phone into the active-order payload", async () => {
    const { activeOrders } = await getLiveMapData();
    expect(activeOrders[0].customer).not.toHaveProperty("phone");
  });
});

// ── RBAC ────────────────────────────────────────────────────────────────────────
describe("live-map RBAC", () => {
  const run = (middleware, user) => {
    const req = { user };
    const res = {};
    let nextErr = "no-call";
    middleware(req, res, (err) => { nextErr = err ?? null; });
    return nextErr;
  };

  it("admin live-map allows ADMIN role", () => {
    expect(run(roleMiddleware(["ADMIN"]), { role: "ADMIN", roles: ["ADMIN"] })).toBeNull();
  });

  it("admin live-map blocks a CUSTOMER with 403", () => {
    const err = run(roleMiddleware(["ADMIN"]), { role: "CUSTOMER", roles: ["CUSTOMER"] });
    expect(err).toMatchObject({ statusCode: 403 });
  });

  it("admin live-map blocks a DELIVERY rider with 403", () => {
    const err = run(roleMiddleware(["ADMIN"]), { role: "DELIVERY", roles: ["DELIVERY"] });
    expect(err).toMatchObject({ statusCode: 403 });
  });

  it("delivery location allows DELIVERY role", () => {
    expect(run(roleMiddleware(["DELIVERY", "ADMIN"]), { role: "DELIVERY", roles: ["DELIVERY"] })).toBeNull();
  });

  it("delivery location blocks a CUSTOMER with 403", () => {
    const err = run(roleMiddleware(["DELIVERY", "ADMIN"]), { role: "CUSTOMER", roles: ["CUSTOMER"] });
    expect(err).toMatchObject({ statusCode: 403 });
  });

  it("blocks an unauthenticated request with 401", () => {
    const err = run(roleMiddleware(["ADMIN"]), undefined);
    expect(err).toMatchObject({ statusCode: 401 });
  });
});
