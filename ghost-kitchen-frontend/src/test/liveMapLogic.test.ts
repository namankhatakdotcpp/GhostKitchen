import { describe, it, expect } from "vitest";
import {
  filterRiders,
  filterRestaurants,
  computeFleetStats,
  routeLinesForOrder,
  heatPoints,
  DEFAULT_RIDER_FILTERS,
  type LiveRider,
  type LiveRestaurant,
  type LiveActiveOrder,
} from "@/lib/liveMap";

const rider = (over: Partial<LiveRider>): LiveRider => ({
  id: "d1",
  name: "Rider One",
  status: "ONLINE",
  latitude: 28.7,
  longitude: 77.1,
  heading: null,
  speed: null,
  lastSeenAt: new Date().toISOString(),
  activeDeliveries: 0,
  ...over,
});

const restaurant = (over: Partial<LiveRestaurant>): LiveRestaurant => ({
  id: "r1",
  name: "Pizza Place",
  latitude: 28.61,
  longitude: 77.2,
  rating: 4.5,
  status: "OPEN",
  activeOrders: 0,
  todaysOrders: 0,
  ...over,
});

const order = (over: Partial<LiveActiveOrder>): LiveActiveOrder => ({
  id: "o1",
  orderNumber: "ABC123",
  status: "OUT_FOR_DELIVERY",
  total: 45000,
  estimatedDelivery: null,
  restaurant: { id: "r1", name: "Pizza Place", latitude: 28.61, longitude: 77.2 },
  customer: { id: "c1", name: "Alice", latitude: 28.55, longitude: 77.05 },
  rider: { id: "d1", name: "Rider One", latitude: 28.7, longitude: 77.1 },
  ...over,
});

describe("filterRiders", () => {
  const riders = [
    rider({ id: "d1", name: "Aman", status: "ONLINE", activeDeliveries: 0 }),
    rider({ id: "d2", name: "Bharat", status: "OFFLINE", activeDeliveries: 0 }),
    rider({ id: "d3", name: "Chetan", status: "ONLINE", activeDeliveries: 2 }),
    rider({ id: "d4", name: "Divya", status: "IDLE", activeDeliveries: 0 }),
  ];

  it("returns all riders with default filters and empty search", () => {
    expect(filterRiders(riders, DEFAULT_RIDER_FILTERS, "")).toHaveLength(4);
  });

  it("hides offline riders when the offline facet is off", () => {
    const out = filterRiders(riders, { online: true, offline: false, busy: false }, "");
    expect(out.map((r) => r.id)).toEqual(["d1", "d3", "d4"]); // ONLINE + IDLE
  });

  it("shows only offline riders when only offline is on", () => {
    const out = filterRiders(riders, { online: false, offline: true, busy: false }, "");
    expect(out.map((r) => r.id)).toEqual(["d2"]);
  });

  it("shows only busy riders when only busy is on", () => {
    const out = filterRiders(riders, { online: false, offline: false, busy: true }, "");
    expect(out.map((r) => r.id)).toEqual(["d3"]);
  });

  it("searches by name (case-insensitive)", () => {
    expect(filterRiders(riders, DEFAULT_RIDER_FILTERS, "bhar").map((r) => r.id)).toEqual(["d2"]);
  });

  it("searches by rider id", () => {
    expect(filterRiders(riders, DEFAULT_RIDER_FILTERS, "d3").map((r) => r.id)).toEqual(["d3"]);
  });
});

describe("filterRestaurants", () => {
  const list = [restaurant({ id: "r1", name: "Pizza Place" }), restaurant({ id: "r2", name: "Curry House" })];
  it("returns all when search empty", () => {
    expect(filterRestaurants(list, "")).toHaveLength(2);
  });
  it("filters by name", () => {
    expect(filterRestaurants(list, "curry").map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("computeFleetStats", () => {
  const now = new Date("2026-06-13T12:00:00.000Z").getTime();
  it("counts presence buckets and averages speed and ETA", () => {
    const riders = [
      rider({ status: "ONLINE", speed: 20 }),
      rider({ status: "ONLINE", speed: 40 }),
      rider({ status: "IDLE", speed: null }),
      rider({ status: "OFFLINE", speed: 0 }),
    ];
    const orders = [
      order({ estimatedDelivery: new Date(now + 10 * 60_000).toISOString() }),
      order({ estimatedDelivery: new Date(now + 20 * 60_000).toISOString() }),
      order({ estimatedDelivery: new Date(now - 5 * 60_000).toISOString() }), // past — ignored
    ];
    const stats = computeFleetStats(riders, orders, now);
    expect(stats).toMatchObject({ online: 2, idle: 1, offline: 1, activeDeliveries: 3 });
    expect(stats.avgSpeedKmh).toBe(30); // (20+40)/2; nulls and 0 excluded
    expect(stats.avgEtaMin).toBe(15); // (10+20)/2; past ETA excluded
  });

  it("returns null averages when there is no data", () => {
    const stats = computeFleetStats([rider({ status: "OFFLINE", speed: null })], [], now);
    expect(stats.avgSpeedKmh).toBeNull();
    expect(stats.avgEtaMin).toBeNull();
  });
});

describe("routeLinesForOrder", () => {
  it("builds rider→restaurant and rider→customer lines", () => {
    const route = routeLinesForOrder(order({}));
    expect(route.riderToRestaurant).toEqual([[28.7, 77.1], [28.61, 77.2]]);
    expect(route.riderToCustomer).toEqual([[28.7, 77.1], [28.55, 77.05]]);
    expect(route.focus).toEqual([28.7, 77.1]);
  });

  it("returns null lines when the rider has no location", () => {
    const route = routeLinesForOrder(order({ rider: { id: "d1", name: "R", latitude: null, longitude: null } }));
    expect(route.riderToRestaurant).toBeNull();
    expect(route.riderToCustomer).toBeNull();
    expect(route.focus).toEqual([28.61, 77.2]); // falls back to restaurant
  });
});

describe("heatPoints", () => {
  it("emits a point per active order and weighted restaurant points", () => {
    const pts = heatPoints(
      [restaurant({ id: "r1", activeOrders: 4 }), restaurant({ id: "r2", activeOrders: 0 })],
      [order({}), order({ id: "o2" })],
    );
    // 2 orders + 1 restaurant with load (r2 has 0 → skipped)
    expect(pts).toHaveLength(3);
    expect(pts.every(([, , w]) => w > 0 && w <= 1)).toBe(true);
  });

  it("skips orders and restaurants without coordinates", () => {
    const pts = heatPoints(
      [restaurant({ latitude: null, longitude: null, activeOrders: 5 })],
      [order({ customer: null, rider: null, restaurant: null })],
    );
    expect(pts).toHaveLength(0);
  });
});
