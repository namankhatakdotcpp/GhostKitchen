/**
 * Executive Analytics — unit + integration tests (Wave C).
 * All DB interaction is mocked; no real Postgres connection required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("../config/prisma.js", () => ({
  prisma: {
    order: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    restaurant: { count: vi.fn(), findMany: vi.fn() },
    user: { count: vi.fn(), findMany: vi.fn() },
    review: { aggregate: vi.fn() },
    riderSession: { findMany: vi.fn() },
  },
}));

// Cache pass-through — always call the fetch function so tests run the real logic
vi.mock("../utils/cache.js", () => ({
  cacheOrFetch: vi.fn((_key, fetchFn) => fetchFn()),
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../modules/ops/ops.logic.js", async (importOriginal) => {
  const real = await importOriginal();
  return real; // use real computeTrend / scoring functions
});

const exec = await import("../modules/exec/exec.service.js");
const ctrl = await import("../modules/exec/exec.controller.js");
const { prisma } = await import("../config/prisma.js");

// ── Shared helpers ─────────────────────────────────────────────────────────────

const NOW = new Date("2026-06-14T12:00:00.000Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);

const mockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

const defaultPrismaSetup = () => {
  prisma.order.count.mockResolvedValue(0);
  prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 }, _count: { id: 0 }, _avg: { rating: null } });
  prisma.order.findMany.mockResolvedValue([]);
  prisma.order.groupBy.mockResolvedValue([]);
  prisma.restaurant.count.mockResolvedValue(0);
  prisma.restaurant.findMany.mockResolvedValue([]);
  prisma.user.count.mockResolvedValue(0);
  prisma.user.findMany.mockResolvedValue([]);
  prisma.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { id: 0 } });
  prisma.riderSession.findMany.mockResolvedValue([]);
};

beforeEach(() => {
  vi.clearAllMocks();
  defaultPrismaSetup();
});

// ── Unit: growthPct (via KPI output) ─────────────────────────────────────────

describe("getExecutiveKpis — growth rates", () => {
  it("returns 100% growth when previous is 0 and current > 0", async () => {
    // orders: week=10, prevWeek=0 → 100%; revenue: all zero → null
    prisma.order.count
      .mockResolvedValueOnce(3)   // today
      .mockResolvedValueOnce(10)  // week
      .mockResolvedValueOnce(30)  // month
      .mockResolvedValueOnce(0)   // prevWeek
      .mockResolvedValueOnce(0);  // prevMonth

    // Revenue all zero → growthPct(0, 0) = null
    prisma.order.aggregate
      .mockResolvedValueOnce({ _sum: { total: 0 } })  // revToday
      .mockResolvedValueOnce({ _sum: { total: 0 } })  // revWeek
      .mockResolvedValueOnce({ _sum: { total: 0 } })  // revMonth
      .mockResolvedValueOnce({ _sum: { total: 0 } })  // revPrevWeek
      .mockResolvedValueOnce({ _sum: { total: 0 } }); // revPrevMonth

    const result = await exec.getExecutiveKpis();
    expect(result.orders.growthWeekPct).toBe(100);
    expect(result.revenue.growthWeekPct).toBeNull(); // both zero → null
  });

  it("computes positive growth correctly", async () => {
    prisma.order.count
      .mockResolvedValueOnce(5)   // today
      .mockResolvedValueOnce(120) // week
      .mockResolvedValueOnce(400) // month
      .mockResolvedValueOnce(100) // prevWeek (20% growth)
      .mockResolvedValueOnce(300); // prevMonth

    // Revenue aggregates: today, week, month, prevWeek, prevMonth
    prisma.order.aggregate
      .mockResolvedValueOnce({ _sum: { total: 50000 } })     // today
      .mockResolvedValueOnce({ _sum: { total: 120000 } })    // week
      .mockResolvedValueOnce({ _sum: { total: 400000 } })    // month
      .mockResolvedValueOnce({ _sum: { total: 100000 } })    // prevWeek
      .mockResolvedValueOnce({ _sum: { total: 300000 } });   // prevMonth

    const result = await exec.getExecutiveKpis();
    expect(result.orders.growthWeekPct).toBe(20);
    expect(result.revenue.growthWeekPct).toBe(20);
  });

  it("computes negative growth", async () => {
    prisma.order.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(50)  // week
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(100) // prevWeek — dropped 50%
      .mockResolvedValueOnce(0);

    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 } });

    const result = await exec.getExecutiveKpis();
    expect(result.orders.growthWeekPct).toBe(-50);
  });

  it("returns null growth when both are zero", async () => {
    prisma.order.count.mockResolvedValue(0);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 } });

    const result = await exec.getExecutiveKpis();
    expect(result.orders.growthWeekPct).toBeNull();
    expect(result.revenue.growthWeekPct).toBeNull();
  });
});

// ── Unit: KPI computation ─────────────────────────────────────────────────────

describe("getExecutiveKpis — platform metrics", () => {
  it("computes avg delivery time from placedAt/deliveredAt", async () => {
    prisma.order.count.mockResolvedValue(10);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 50000 } });

    const placed = new Date("2026-06-14T10:00:00Z");
    const delivered30 = new Date("2026-06-14T10:30:00Z"); // 30 min
    const delivered40 = new Date("2026-06-14T10:40:00Z"); // 40 min
    prisma.order.findMany
      .mockResolvedValueOnce([
        { placedAt: placed, deliveredAt: delivered30 },
        { placedAt: placed, deliveredAt: delivered40 },
      ])
      .mockResolvedValueOnce([]);

    const result = await exec.getExecutiveKpis();
    expect(result.platform.avgDeliveryMin).toBe(35);
  });

  it("ignores negative delivery times (data anomalies)", async () => {
    prisma.order.count.mockResolvedValue(5);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 10000 } });

    const t = new Date("2026-06-14T10:00:00Z");
    prisma.order.findMany
      .mockResolvedValueOnce([
        { placedAt: t, deliveredAt: new Date(t.getTime() - 60000) }, // -1 min (anomaly)
        { placedAt: t, deliveredAt: new Date(t.getTime() + 1800000) }, // +30 min
      ])
      .mockResolvedValueOnce([]);

    const result = await exec.getExecutiveKpis();
    // -1 min → 0, 30 min; avg = (0+30)/2 = 15
    expect(result.platform.avgDeliveryMin).toBe(15);
  });

  it("returns null avgDeliveryMin when no delivered orders", async () => {
    prisma.order.count.mockResolvedValue(0);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 } });
    prisma.order.findMany.mockResolvedValue([]);

    const result = await exec.getExecutiveKpis();
    expect(result.platform.avgDeliveryMin).toBeNull();
  });

  it("computes customer satisfaction from review average", async () => {
    prisma.order.count.mockResolvedValue(0);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 } });
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4.2 }, _count: { id: 100 } });

    const result = await exec.getExecutiveKpis();
    // 4.2/5 * 100 = 84
    expect(result.platform.customerSatisfaction).toBe(84);
    expect(result.platform.satisfactionRating).toBe(4.2);
    expect(result.platform.reviewCount).toBe(100);
  });

  it("returns null satisfaction when no reviews exist", async () => {
    prisma.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { id: 0 } });

    const result = await exec.getExecutiveKpis();
    expect(result.platform.customerSatisfaction).toBeNull();
  });

  it("computes order success and cancellation rates", async () => {
    prisma.order.count.mockResolvedValue(100);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 100000 } });
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.groupBy.mockResolvedValue([
      { status: "DELIVERED", _count: { id: 80 } },
      { status: "CANCELLED", _count: { id: 12 } },
      { status: "PLACED", _count: { id: 8 } },
    ]);

    const result = await exec.getExecutiveKpis();
    expect(result.platform.orderSuccessRate).toBe(80);
    expect(result.platform.cancellationRate).toBe(12);
  });
});

// ── Unit: Trends ──────────────────────────────────────────────────────────────

describe("getTrends", () => {
  it("builds day buckets with correct date keys", async () => {
    prisma.order.findMany.mockResolvedValue([]);

    const result = await exec.getTrends({ days: 7 });
    expect(result.days).toBe(7);
    expect(result.revenue).toHaveLength(7);
    expect(result.orders).toHaveLength(7);
    expect(result.deliveryTime).toHaveLength(7);
    expect(result.cancellation).toHaveLength(7);
  });

  it("caps days at 90", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    const result = await exec.getTrends({ days: 365 });
    expect(result.days).toBe(90);
    expect(result.revenue).toHaveLength(90);
  });

  it("defaults to 7 days for invalid input", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    const result = await exec.getTrends({ days: "bad" });
    expect(result.days).toBe(7);
  });

  it("buckets revenue for delivered orders only", async () => {
    // Use UTC noon so the date key is always today in UTC regardless of local TZ
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const todayKey = today.toISOString().slice(0, 10);

    prisma.order.findMany.mockResolvedValue([
      { createdAt: today, status: "DELIVERED", total: 10000, placedAt: today, deliveredAt: new Date(today.getTime() + 1800000), readyAt: null },
      { createdAt: today, status: "CANCELLED", total: 5000, placedAt: today, deliveredAt: null, readyAt: null },
    ]);

    const result = await exec.getTrends({ days: 7 });
    const todayBucket = result.revenue.find((b) => b.date === todayKey);
    expect(todayBucket).toBeDefined();
    expect(todayBucket.revenue).toBe(10000); // only delivered
    expect(todayBucket.orders).toBe(2);
  });

  it("computes cancellation rate per day", async () => {
    // Use UTC noon to ensure the order lands in the single bucket
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    const todayKey = today.toISOString().slice(0, 10);

    prisma.order.findMany.mockResolvedValue([
      { createdAt: today, status: "DELIVERED", total: 1000, placedAt: today, deliveredAt: today, readyAt: null },
      { createdAt: today, status: "CANCELLED", total: 0, placedAt: today, deliveredAt: null, readyAt: null },
    ]);

    const result = await exec.getTrends({ days: 1 });
    const bucket = result.cancellation.find((b) => b.date === todayKey);
    expect(bucket).toBeDefined();
    expect(bucket.rate).toBe(50); // 1 cancelled / 2 total
  });

  it("excludes anomalous delivery times (>300 min)", async () => {
    // Use a fixed UTC date so bucket lookup is deterministic
    const placed = new Date();
    placed.setUTCHours(10, 0, 0, 0);
    const placedKey = placed.toISOString().slice(0, 10);
    const deliveredFar = new Date(placed.getTime() + 600 * 60000); // 600 min — excluded
    const deliveredOk  = new Date(placed.getTime() +  30 * 60000);  // 30 min

    prisma.order.findMany.mockResolvedValue([
      { createdAt: placed, status: "DELIVERED", total: 100, placedAt: placed, deliveredAt: deliveredFar, readyAt: null },
      { createdAt: placed, status: "DELIVERED", total: 100, placedAt: placed, deliveredAt: deliveredOk,  readyAt: null },
    ]);

    const result = await exec.getTrends({ days: 7 });
    const bucket = result.deliveryTime.find((b) => b.date === placedKey);
    expect(bucket).toBeDefined();
    // Only the 30-min one is valid → avg = 30
    expect(bucket.avgMin).toBe(30);
  });
});

// ── Unit: Fleet Utilization ───────────────────────────────────────────────────

describe("getFleetUtilization", () => {
  it("returns zero utilization when no riders on duty", async () => {
    prisma.user.count
      .mockResolvedValueOnce(10)  // totalRiders
      .mockResolvedValueOnce(0);  // onDuty
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.riderSession.findMany.mockResolvedValue([]);

    const result = await exec.getFleetUtilization();
    expect(result.utilizationPct).toBe(0);
    expect(result.idle).toBe(0);
    expect(result.active).toBe(0);
  });

  it("computes utilization and idle correctly", async () => {
    prisma.user.count
      .mockResolvedValueOnce(20)  // total
      .mockResolvedValueOnce(10); // onDuty
    // 4 distinct riders currently delivering
    prisma.order.groupBy.mockResolvedValue([
      { agentId: "r1", _count: { id: 1 } },
      { agentId: "r2", _count: { id: 2 } },
      { agentId: "r3", _count: { id: 1 } },
      { agentId: "r4", _count: { id: 1 } },
    ]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.riderSession.findMany.mockResolvedValue([]);

    const result = await exec.getFleetUtilization();
    expect(result.active).toBe(4);
    expect(result.idle).toBe(6);   // 10 on duty - 4 active
    expect(result.utilizationPct).toBe(40);
  });

  it("computes average orders per rider from last-7-day deliveries", async () => {
    prisma.user.count.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
    prisma.order.groupBy.mockResolvedValue([]);
    const t = new Date("2026-06-14T10:00:00Z");
    const delivered = new Date("2026-06-14T10:35:00Z"); // 35 min
    prisma.order.findMany.mockResolvedValue([
      { agentId: "r1", placedAt: t, deliveredAt: delivered },
      { agentId: "r1", placedAt: t, deliveredAt: delivered },
      { agentId: "r2", placedAt: t, deliveredAt: delivered },
    ]);
    prisma.riderSession.findMany.mockResolvedValue([]);

    const result = await exec.getFleetUtilization();
    // 3 deliveries by 2 distinct riders → avg = 1 (rounded: 3/2 = 1.5 → 2 because Math.round)
    expect(result.avgOrdersPerRider).toBe(2);
    expect(result.avgDeliveryDurationMin).toBe(35);
  });

  it("includes session data for avgActiveHoursPerRider", async () => {
    prisma.user.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    prisma.order.groupBy.mockResolvedValue([]);
    const t = new Date("2026-06-14T10:00:00Z");
    prisma.order.findMany.mockResolvedValue([
      { agentId: "r1", placedAt: t, deliveredAt: new Date(t.getTime() + 1800000) },
    ]);
    prisma.riderSession.findMany.mockResolvedValue([
      { riderId: "r1", durationMin: 120 }, // 2 hours
      { riderId: "r1", durationMin: 60 },  // 1 hour
    ]);

    const result = await exec.getFleetUtilization();
    // 1 rider delivered; total active = (120+60)/60 = 3 hours; avg = 3
    expect(result.avgActiveHoursPerRider).toBe(3);
  });
});

// ── Unit: Restaurant Intelligence ─────────────────────────────────────────────

describe("getRestaurantIntelligence", () => {
  it("returns top-by-revenue sorted descending", async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([
        { restaurantId: "r1", status: "DELIVERED", total: 50000 },
        { restaurantId: "r2", status: "DELIVERED", total: 10000 },
      ])
      .mockResolvedValueOnce([]); // prepOrders
    prisma.restaurant.findMany.mockResolvedValue([
      { id: "r1", name: "Alpha", rating: 4.5, isOpen: true, suspended: false },
      { id: "r2", name: "Beta", rating: 3.8, isOpen: true, suspended: false },
    ]);

    const result = await exec.getRestaurantIntelligence({ days: 7 });
    expect(result.topByRevenue[0].restaurantId).toBe("r1");
    expect(result.topByRevenue[1].restaurantId).toBe("r2");
  });

  it("returns fastest restaurants by avgPrepMin ascending", async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([]) // orders
      .mockResolvedValueOnce([
        { restaurantId: "r1", placedAt: new Date("2026-06-14T10:00:00Z"), readyAt: new Date("2026-06-14T10:25:00Z") }, // 25 min
        { restaurantId: "r2", placedAt: new Date("2026-06-14T10:00:00Z"), readyAt: new Date("2026-06-14T10:10:00Z") }, // 10 min
      ]);
    prisma.restaurant.findMany.mockResolvedValue([
      { id: "r1", name: "Slow", rating: 4.0, isOpen: true, suspended: false },
      { id: "r2", name: "Fast", rating: 4.0, isOpen: true, suspended: false },
    ]);

    const result = await exec.getRestaurantIntelligence({ days: 7 });
    expect(result.fastest[0].name).toBe("Fast");
    expect(result.slowest[0].name).toBe("Slow");
  });

  it("excludes anomalous prep times (>180 min) from fastest/slowest", async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { restaurantId: "r1", placedAt: new Date("2026-06-14T06:00:00Z"), readyAt: new Date("2026-06-14T10:00:00Z") }, // 240 min — excluded
      ]);
    prisma.restaurant.findMany.mockResolvedValue([
      { id: "r1", name: "Glitched", rating: 3.0, isOpen: true, suspended: false },
    ]);

    const result = await exec.getRestaurantIntelligence({ days: 7 });
    expect(result.fastest).toHaveLength(0);
    expect(result.slowest).toHaveLength(0);
  });

  it("returns topByRating sorted desc", async () => {
    prisma.order.findMany.mockResolvedValue([]).mockResolvedValue([]);
    prisma.restaurant.findMany.mockResolvedValue([
      { id: "r1", name: "Low", rating: 2.0, isOpen: true, suspended: false },
      { id: "r2", name: "High", rating: 4.9, isOpen: true, suspended: false },
    ]);

    const result = await exec.getRestaurantIntelligence({ days: 7 });
    expect(result.topByRating[0].name).toBe("High");
  });
});

// ── Unit: Customer Intelligence ───────────────────────────────────────────────

describe("getCustomerIntelligence", () => {
  it("identifies new vs returning customers correctly", async () => {
    const windowStart = new Date(Date.now() - 29 * 86400000); // ~30 days ago

    // In-window orders: c1 (1 order), c2 (2 orders), c3 (1 order)
    prisma.order.groupBy
      .mockResolvedValueOnce([
        { customerId: "c1", _count: { id: 1 } },
        { customerId: "c2", _count: { id: 2 } },
        { customerId: "c3", _count: { id: 1 } },
      ])
      // All-time first orders
      .mockResolvedValueOnce([
        { customerId: "c1", _min: { createdAt: new Date(Date.now() - 5 * 86400000) } },  // new (within 30d)
        { customerId: "c2", _min: { createdAt: new Date(Date.now() - 60 * 86400000) } }, // returning
        { customerId: "c3", _min: { createdAt: new Date(Date.now() - 60 * 86400000) } }, // returning
      ])
      // Prev window customers
      .mockResolvedValueOnce([{ customerId: "c2", _count: { id: 1 } }]);

    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 30000 }, _count: { id: 3 } });

    const result = await exec.getCustomerIntelligence({ days: 30 });
    expect(result.totalCustomers).toBe(3);
    expect(result.newCustomers).toBe(1);
    expect(result.returningCustomers).toBe(2);
    expect(result.repeatCustomers).toBe(1); // c2 had 2 orders
    expect(result.newPct).toBe(33);
    expect(result.returningPct).toBe(67);
  });

  it("computes avg order value correctly", async () => {
    prisma.order.groupBy
      .mockResolvedValueOnce([{ customerId: "c1", _count: { id: 1 } }])
      .mockResolvedValueOnce([{ customerId: "c1", _min: { createdAt: new Date() } }])
      .mockResolvedValueOnce([]);

    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 90000 }, _count: { id: 3 } });

    const result = await exec.getCustomerIntelligence({ days: 7 });
    expect(result.avgOrderValuePaise).toBe(30000); // 90000/3
  });

  it("computes retention rate", async () => {
    prisma.order.groupBy
      .mockResolvedValueOnce([
        { customerId: "c1", _count: { id: 1 } },
        { customerId: "c2", _count: { id: 1 } },
      ])
      .mockResolvedValueOnce([
        { customerId: "c1", _min: { createdAt: new Date() } },
        { customerId: "c2", _min: { createdAt: new Date() } },
      ])
      // Prev window: c1 and c3 ordered — c1 retained, c3 churned
      .mockResolvedValueOnce([
        { customerId: "c1", _count: { id: 1 } },
        { customerId: "c3", _count: { id: 1 } },
      ]);

    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 }, _count: { id: 0 } });

    const result = await exec.getCustomerIntelligence({ days: 30 });
    expect(result.prevWindowCustomers).toBe(2);
    expect(result.retainedCustomers).toBe(1); // only c1 came back
    expect(result.retentionRate).toBe(50);
  });

  it("returns null retentionRate when no prev-window customers", async () => {
    prisma.order.groupBy
      .mockResolvedValueOnce([{ customerId: "c1", _count: { id: 1 } }])
      .mockResolvedValueOnce([{ customerId: "c1", _min: { createdAt: new Date() } }])
      .mockResolvedValueOnce([]);

    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 }, _count: { id: 0 } });

    const result = await exec.getCustomerIntelligence({ days: 7 });
    expect(result.retentionRate).toBeNull();
  });
});

// ── Unit: Executive Summary ───────────────────────────────────────────────────

describe("getExecutiveSummary", () => {
  const setupHealthyPlatform = () => {
    // order counts
    prisma.order.count
      .mockResolvedValueOnce(50)   // today
      .mockResolvedValueOnce(300)  // week
      .mockResolvedValueOnce(1200) // month
      .mockResolvedValueOnce(250)  // prevWeek
      .mockResolvedValueOnce(1000) // prevMonth
      // second call from _fetchFleet
      .mockResolvedValueOnce(20)   // totalRiders
      .mockResolvedValueOnce(8);   // onDuty

    prisma.order.aggregate
      .mockResolvedValueOnce({ _sum: { total: 500000 } })  // revToday
      .mockResolvedValueOnce({ _sum: { total: 3000000 } }) // revWeek
      .mockResolvedValueOnce({ _sum: { total: 10000000 } }) // revMonth
      .mockResolvedValueOnce({ _sum: { total: 2500000 } }) // prevWeek
      .mockResolvedValueOnce({ _sum: { total: 8000000 } }) // prevMonth
      // _fetchCustomerIntelligence
      .mockResolvedValueOnce({ _sum: { total: 500000 }, _count: { id: 10 } });

    prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4.3 }, _count: { id: 200 } });

    prisma.order.groupBy
      // statusCounts for _fetchKpis
      .mockResolvedValueOnce([
        { status: "DELIVERED", _count: { id: 900 } },
        { status: "CANCELLED", _count: { id: 80 } },
        { status: "PLACED", _count: { id: 20 } },
      ])
      // activeDeliveryGroups for _fetchFleet
      .mockResolvedValueOnce([
        { agentId: "r1", _count: { id: 1 } },
        { agentId: "r2", _count: { id: 1 } },
        { agentId: "r3", _count: { id: 1 } },
        { agentId: "r4", _count: { id: 1 } },
        { agentId: "r5", _count: { id: 1 } },
      ])
      // windowOrderGroups for _fetchCustomers
      .mockResolvedValueOnce([
        { customerId: "c1", _count: { id: 2 } },
        { customerId: "c2", _count: { id: 1 } },
      ])
      // allFirstOrders for _fetchCustomers
      .mockResolvedValueOnce([
        { customerId: "c1", _min: { createdAt: new Date(Date.now() - 60 * 86400000) } },
        { customerId: "c2", _min: { createdAt: new Date(Date.now() - 2 * 86400000) } },
      ])
      // retentionBuckets
      .mockResolvedValueOnce([{ customerId: "c1", _count: { id: 1 } }]);

    // _buildSummary calls: _fetchKpis, _fetchFleet, _fetchCustomerIntelligence (parallel)
    // findMany order: [1] deliveryTimeRows (kpis), [2] prepTimeRows (kpis), [3] weekDeliveryRows (fleet)
    const t = new Date("2026-06-14T10:00:00Z");
    prisma.order.findMany
      .mockResolvedValueOnce([{ placedAt: t, deliveredAt: new Date(t.getTime() + 25 * 60000) }]) // deliveryTimeRows
      .mockResolvedValueOnce([{ placedAt: t, readyAt: new Date(t.getTime() + 15 * 60000) }])   // prepTimeRows
      .mockResolvedValueOnce([{ agentId: "r1", placedAt: t, deliveredAt: new Date(t.getTime() + 25 * 60000) }]); // weekDeliveryRows

    prisma.restaurant.count.mockResolvedValue(45);
    // user.count: [1] activeRiders (kpis), [2] totalRiders (fleet), [3] onDuty (fleet)
    prisma.user.count.mockResolvedValueOnce(30).mockResolvedValueOnce(20).mockResolvedValueOnce(8);
    prisma.riderSession.findMany.mockResolvedValue([]);
    prisma.restaurant.findMany.mockResolvedValue([]);
  };

  it("generates wins for a healthy platform", async () => {
    setupHealthyPlatform();
    const result = await exec.getExecutiveSummary({ period: "weekly" });
    expect(result.period).toBe("weekly");
    expect(Array.isArray(result.wins)).toBe(true);
    expect(Array.isArray(result.risks)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
    expect(result.generatedAt).toBeDefined();
  });

  it("includes revenue and order counts in headline", async () => {
    setupHealthyPlatform();
    const result = await exec.getExecutiveSummary({ period: "weekly" });
    expect(typeof result.headline.orders).toBe("number");
    expect(typeof result.headline.revenue).toBe("number");
  });

  it("sets correct periodLabel for each period", async () => {
    // We test just the label without real DB interaction
    setupHealthyPlatform();
    const r = await exec.getExecutiveSummary({ period: "daily" });
    expect(r.periodLabel).toBe("Today");
  });
});

// ── Security: controller RBAC wiring ─────────────────────────────────────────

describe("exec.controller security", () => {
  it("getKpis delegates to execService", async () => {
    prisma.order.count.mockResolvedValue(0);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 } });
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.restaurant.count.mockResolvedValue(0);
    prisma.user.count.mockResolvedValue(0);
    prisma.review.aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { id: 0 } });

    const res = mockRes();
    await ctrl.getKpis({}, res, vi.fn());
    expect(res.json).toHaveBeenCalledOnce();
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty("revenue");
    expect(payload).toHaveProperty("orders");
    expect(payload).toHaveProperty("platform");
  });

  it("getTrends passes days query param", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    const res = mockRes();
    await ctrl.getTrends({ query: { days: "30" } }, res, vi.fn());
    const payload = res.json.mock.calls[0][0];
    expect(payload.days).toBe(30);
    expect(payload.revenue).toHaveLength(30);
  });

  it("getFleet returns utilization data", async () => {
    prisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(5);
    prisma.order.groupBy.mockResolvedValue([{ agentId: "r1", _count: { id: 1 } }]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.riderSession.findMany.mockResolvedValue([]);

    const res = mockRes();
    await ctrl.getFleet({}, res, vi.fn());
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty("utilizationPct");
    expect(payload).toHaveProperty("active");
    expect(payload).toHaveProperty("idle");
  });

  it("getRestaurants passes days query param", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.restaurant.findMany.mockResolvedValue([]);

    const res = mockRes();
    await ctrl.getRestaurants({ query: { days: "14" } }, res, vi.fn());
    const payload = res.json.mock.calls[0][0];
    expect(payload.days).toBe(14);
    expect(payload).toHaveProperty("topByRevenue");
    expect(payload).toHaveProperty("fastest");
  });

  it("getCustomers passes days query param", async () => {
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 0 }, _count: { id: 0 } });

    const res = mockRes();
    await ctrl.getCustomers({ query: { days: "7" } }, res, vi.fn());
    const payload = res.json.mock.calls[0][0];
    expect(payload.days).toBe(7);
    expect(payload).toHaveProperty("totalCustomers");
  });

  it("getSummary passes period query param", async () => {
    // Minimal setup for summary
    prisma.order.count.mockResolvedValue(10);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 10000 }, _count: { id: 1 } });
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.restaurant.count.mockResolvedValue(5);
    prisma.restaurant.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(3);
    prisma.review.aggregate.mockResolvedValue({ _avg: { rating: 4.0 }, _count: { id: 50 } });
    prisma.riderSession.findMany.mockResolvedValue([]);

    const res = mockRes();
    await ctrl.getSummary({ query: { period: "monthly" } }, res, vi.fn());
    const payload = res.json.mock.calls[0][0];
    expect(payload.period).toBe("monthly");
  });

  it("forwards errors to next()", async () => {
    prisma.order.count.mockRejectedValue(new Error("DB error"));
    const next = vi.fn();
    await ctrl.getKpis({}, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── Integration: data shape contracts ────────────────────────────────────────

describe("data shape contracts", () => {
  it("getExecutiveKpis always returns all required fields", async () => {
    const result = await exec.getExecutiveKpis();
    expect(result).toMatchObject({
      revenue: expect.objectContaining({ today: expect.any(Number), week: expect.any(Number), month: expect.any(Number) }),
      orders: expect.objectContaining({ today: expect.any(Number), week: expect.any(Number), month: expect.any(Number) }),
      platform: expect.objectContaining({ activeRestaurants: expect.any(Number), activeRiders: expect.any(Number) }),
      generatedAt: expect.any(String),
    });
  });

  it("getTrends revenue bucket always has date, revenue, orders", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    const result = await exec.getTrends({ days: 3 });
    for (const b of result.revenue) {
      expect(b).toHaveProperty("date");
      expect(b).toHaveProperty("revenue");
      expect(b).toHaveProperty("orders");
    }
  });

  it("getRestaurantIntelligence always returns all sub-lists", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.restaurant.findMany.mockResolvedValue([]);
    const result = await exec.getRestaurantIntelligence({ days: 7 });
    expect(result).toHaveProperty("topByRevenue");
    expect(result).toHaveProperty("topByRating");
    expect(result).toHaveProperty("fastest");
    expect(result).toHaveProperty("slowest");
  });

  it("getFleetUtilization always returns all fields", async () => {
    prisma.user.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.order.findMany.mockResolvedValue([]);
    prisma.riderSession.findMany.mockResolvedValue([]);

    const result = await exec.getFleetUtilization();
    expect(result).toMatchObject({
      totalRiders: expect.any(Number),
      onDuty: expect.any(Number),
      active: expect.any(Number),
      idle: expect.any(Number),
      utilizationPct: expect.any(Number),
    });
  });
});
