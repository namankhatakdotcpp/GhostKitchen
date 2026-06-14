/**
 * Executive Analytics Service — Wave C.
 *
 * Pure DB queries with no N+1 fan-out; every function uses aggregations or
 * a single broad findMany that is then bucketed in JS.  Results are cached
 * through the existing cacheOrFetch helper so hot dashboards don't hammer
 * Postgres.
 *
 * Money convention: ALL paise values from the database are kept as paise
 * in the output so callers can format them how they like (divide by 100 for ₹).
 */

import { prisma } from "../../config/prisma.js";
import { cacheOrFetch } from "../../utils/cache.js";
import { computeTrend } from "../ops/ops.logic.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns UTC midnight of (today - (days-1)) days so the window spans `days` UTC calendar days. */
const windowStart = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - (Number(days) - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/** ISO date string "YYYY-MM-DD" for a Date value. */
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

/** Growth % from previous → current. Returns null when there is no baseline. */
function growthPct(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

// ── Phase 1 — Executive KPIs ─────────────────────────────────────────────────

export const getExecutiveKpis = async () =>
  cacheOrFetch("exec:kpis", _fetchKpis, 300);

async function _fetchKpis() {
  const now = new Date();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const weekStart = windowStart(7);
  const monthStart = windowStart(30);

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevMonthStart = new Date(monthStart);
  prevMonthStart.setDate(prevMonthStart.getDate() - 30);

  const [
    ordersToday,
    ordersWeek,
    ordersMonth,
    ordersPrevWeek,
    ordersPrevMonth,
    revToday,
    revWeek,
    revMonth,
    revPrevWeek,
    revPrevMonth,
    activeRestaurants,
    activeRiders,
    deliveryTimeRows,
    prepTimeRows,
    reviewStats,
    statusCounts,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: todayStart, lt: todayEnd } } }),
    prisma.order.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.order.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.order.count({ where: { createdAt: { gte: prevWeekStart, lt: weekStart } } }),
    prisma.order.count({ where: { createdAt: { gte: prevMonthStart, lt: monthStart } } }),

    prisma.order.aggregate({
      _sum: { total: true },
      where: { status: "DELIVERED", createdAt: { gte: todayStart, lt: todayEnd } },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { status: "DELIVERED", createdAt: { gte: weekStart } },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { status: "DELIVERED", createdAt: { gte: monthStart } },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { status: "DELIVERED", createdAt: { gte: prevWeekStart, lt: weekStart } },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      where: { status: "DELIVERED", createdAt: { gte: prevMonthStart, lt: monthStart } },
    }),

    prisma.restaurant.count({ where: { isOpen: true, suspended: false } }),
    prisma.user.count({ where: { roles: { has: "DELIVERY" }, isBlocked: false, isSuspended: false } }),

    // Average delivery time — only orders with both timestamps in last 7 days
    prisma.order.findMany({
      where: { status: "DELIVERED", deliveredAt: { not: null }, createdAt: { gte: weekStart } },
      select: { placedAt: true, deliveredAt: true },
    }),
    // Average prep time — orders where restaurant set readyAt in last 7 days
    prisma.order.findMany({
      where: { readyAt: { not: null }, createdAt: { gte: weekStart } },
      select: { placedAt: true, readyAt: true },
    }),
    // Customer satisfaction — aggregate all reviews
    prisma.review.aggregate({ _avg: { rating: true }, _count: { id: true } }),
    // Order status breakdown for last 30 days (success + cancellation rate)
    prisma.order.groupBy({
      by: ["status"],
      where: { createdAt: { gte: monthStart } },
      _count: { id: true },
    }),
  ]);

  // Compute average delivery time (placedAt → deliveredAt)
  let avgDeliveryMin = null;
  if (deliveryTimeRows.length > 0) {
    const totalMin = deliveryTimeRows.reduce((s, o) => {
      const m = (new Date(o.deliveredAt) - new Date(o.placedAt)) / 60000;
      return s + Math.max(0, m);
    }, 0);
    avgDeliveryMin = Math.round(totalMin / deliveryTimeRows.length);
  }

  // Compute average prep time (placedAt → readyAt) with sanity bounds
  let avgPrepMin = null;
  const validPrep = prepTimeRows.filter((o) => {
    const m = (new Date(o.readyAt) - new Date(o.placedAt)) / 60000;
    return m >= 0 && m <= 180;
  });
  if (validPrep.length > 0) {
    const total = validPrep.reduce((s, o) => s + (new Date(o.readyAt) - new Date(o.placedAt)) / 60000, 0);
    avgPrepMin = Math.round(total / validPrep.length);
  }

  // Success/cancellation rates
  const totalMonth = statusCounts.reduce((s, r) => s + r._count.id, 0);
  const deliveredCount = statusCounts.find((r) => r.status === "DELIVERED")?._count.id ?? 0;
  const cancelledCount = statusCounts.find((r) => r.status === "CANCELLED")?._count.id ?? 0;
  const orderSuccessRate = totalMonth > 0 ? Math.round((deliveredCount / totalMonth) * 100) : null;
  const cancellationRate = totalMonth > 0 ? Math.round((cancelledCount / totalMonth) * 100) : null;

  // Revenue figures (paise)
  const revTodayP = Number(revToday._sum.total ?? 0);
  const revWeekP = Number(revWeek._sum.total ?? 0);
  const revMonthP = Number(revMonth._sum.total ?? 0);
  const revPrevWeekP = Number(revPrevWeek._sum.total ?? 0);
  const revPrevMonthP = Number(revPrevMonth._sum.total ?? 0);

  // Customer satisfaction: avg rating on 0–5 scale → 0–100
  const rawRating = reviewStats._avg.rating;
  const customerSatisfaction = rawRating != null ? Math.round((rawRating / 5) * 100) : null;
  const satisfactionRating = rawRating != null ? Math.round(rawRating * 10) / 10 : null;

  return {
    revenue: {
      today: revTodayP,
      week: revWeekP,
      month: revMonthP,
      growthWeekPct: growthPct(revWeekP, revPrevWeekP),
      growthMonthPct: growthPct(revMonthP, revPrevMonthP),
    },
    orders: {
      today: ordersToday,
      week: ordersWeek,
      month: ordersMonth,
      growthWeekPct: growthPct(ordersWeek, ordersPrevWeek),
      growthMonthPct: growthPct(ordersMonth, ordersPrevMonth),
    },
    platform: {
      activeRestaurants,
      activeRiders,
      avgDeliveryMin,
      avgPrepMin,
      customerSatisfaction,
      satisfactionRating,
      reviewCount: reviewStats._count.id,
      orderSuccessRate,
      cancellationRate,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ── Phase 2 — Trend Analytics ─────────────────────────────────────────────────

export const getTrends = async ({ days = 7 } = {}) => {
  const numDays = Math.min(Number(days) || 7, 90);
  return cacheOrFetch(`exec:trends:${numDays}`, () => _fetchTrends(numDays), 600);
};

async function _fetchTrends(numDays) {
  const start = windowStart(numDays);

  // Single broad fetch — with @@index([createdAt]) this is an efficient range scan.
  // We only select scalar columns so even 100k rows is manageable.
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: start } },
    select: { createdAt: true, status: true, total: true, placedAt: true, deliveredAt: true, readyAt: true },
  });

  // Build empty day buckets for the full window (UTC dates throughout)
  const bucketMap = new Map();
  for (let i = 0; i < numDays; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    bucketMap.set(key, {
      date: key,
      revenue: 0,
      orders: 0,
      cancelled: 0,
      deliveryTimeTotal: 0,
      deliveryTimeCount: 0,
      prepTimeTotal: 0,
      prepTimeCount: 0,
    });
  }

  for (const o of orders) {
    const key = dayKey(o.createdAt);
    const b = bucketMap.get(key);
    if (!b) continue;

    b.orders++;
    if (o.status === "DELIVERED") {
      b.revenue += Number(o.total ?? 0);
      if (o.deliveredAt && o.placedAt) {
        const m = (new Date(o.deliveredAt) - new Date(o.placedAt)) / 60000;
        if (m >= 0 && m <= 300) { b.deliveryTimeTotal += m; b.deliveryTimeCount++; }
      }
    }
    if (o.status === "CANCELLED") b.cancelled++;
    if (o.readyAt && o.placedAt) {
      const m = (new Date(o.readyAt) - new Date(o.placedAt)) / 60000;
      if (m >= 0 && m <= 180) { b.prepTimeTotal += m; b.prepTimeCount++; }
    }
  }

  // Rider performance trend: daily orders per rider — approximated via rider-assigned delivered orders
  const riderDailyGroups = new Map();
  for (const o of orders) {
    if (o.status !== "DELIVERED") continue;
    const key = dayKey(o.createdAt);
    riderDailyGroups.set(key, (riderDailyGroups.get(key) ?? 0) + 1);
  }

  // Restaurant performance trend: daily revenue trend
  // (already captured in buckets.revenue)

  const days7Ago = new Date(start);
  days7Ago.setDate(days7Ago.getDate() + 7);

  return {
    days: numDays,
    revenue: Array.from(bucketMap.values()).map((b) => ({
      date: b.date,
      revenue: b.revenue,
      orders: b.orders,
    })),
    orders: Array.from(bucketMap.values()).map((b) => ({
      date: b.date,
      total: b.orders,
      cancelled: b.cancelled,
      cancellationRate: b.orders > 0 ? Math.round((b.cancelled / b.orders) * 100) : 0,
    })),
    deliveryTime: Array.from(bucketMap.values()).map((b) => ({
      date: b.date,
      avgMin: b.deliveryTimeCount > 0 ? Math.round(b.deliveryTimeTotal / b.deliveryTimeCount) : null,
    })),
    prepTime: Array.from(bucketMap.values()).map((b) => ({
      date: b.date,
      avgMin: b.prepTimeCount > 0 ? Math.round(b.prepTimeTotal / b.prepTimeCount) : null,
    })),
    cancellation: Array.from(bucketMap.values()).map((b) => ({
      date: b.date,
      rate: b.orders > 0 ? Math.round((b.cancelled / b.orders) * 100) : 0,
    })),
  };
}

// ── Phase 4 — Fleet Utilization ───────────────────────────────────────────────

export const getFleetUtilization = async () =>
  cacheOrFetch("exec:fleet", _fetchFleet, 120);

async function _fetchFleet() {
  const weekStart = windowStart(7);

  const [
    totalRiders,
    onDutyCount,
    activeDeliveryGroups,
    weekDeliveryRows,
    sessions,
  ] = await Promise.all([
    prisma.user.count({ where: { roles: { has: "DELIVERY" }, isBlocked: false, isSuspended: false } }),
    prisma.user.count({ where: { roles: { has: "DELIVERY" }, isOnDuty: true } }),
    // Riders currently delivering
    prisma.order.groupBy({
      by: ["agentId"],
      where: { status: "OUT_FOR_DELIVERY", agentId: { not: null } },
      _count: { id: true },
    }),
    // Last 7 days for avg orders per rider and delivery time
    prisma.order.findMany({
      where: { status: "DELIVERED", createdAt: { gte: weekStart }, agentId: { not: null } },
      select: { agentId: true, placedAt: true, deliveredAt: true },
    }),
    // Active duty sessions this week (for total active hours)
    prisma.riderSession.findMany({
      where: { startedAt: { gte: weekStart } },
      select: { riderId: true, durationMin: true },
    }),
  ]);

  const activeRiders = activeDeliveryGroups.length; // distinct riders with live delivery
  const idleRiders = Math.max(0, onDutyCount - activeRiders);
  const utilizationPct = onDutyCount > 0 ? Math.round((activeRiders / onDutyCount) * 100) : 0;

  // Avg orders per rider (last 7 days, among those who delivered)
  const riderDeliveries = new Map();
  let totalDeliveryMin = 0;
  let deliveryCount = 0;

  for (const o of weekDeliveryRows) {
    riderDeliveries.set(o.agentId, (riderDeliveries.get(o.agentId) ?? 0) + 1);
    if (o.deliveredAt && o.placedAt) {
      const m = (new Date(o.deliveredAt) - new Date(o.placedAt)) / 60000;
      if (m >= 0 && m <= 300) { totalDeliveryMin += m; deliveryCount++; }
    }
  }

  const ridersWhoDelivered = riderDeliveries.size;
  const avgOrdersPerRider = ridersWhoDelivered > 0
    ? Math.round(weekDeliveryRows.length / ridersWhoDelivered)
    : 0;
  const avgDeliveryDurationMin = deliveryCount > 0
    ? Math.round(totalDeliveryMin / deliveryCount)
    : null;

  // Total active hours from sessions
  const totalActiveHours = sessions.reduce((s, sess) => s + (sess.durationMin ?? 0) / 60, 0);
  const avgActiveHoursPerRider = ridersWhoDelivered > 0
    ? Math.round((totalActiveHours / ridersWhoDelivered) * 10) / 10
    : 0;

  return {
    totalRiders,
    onDuty: onDutyCount,
    active: activeRiders,
    idle: idleRiders,
    utilizationPct,
    avgOrdersPerRider,
    avgDeliveryDurationMin,
    avgActiveHoursPerRider,
    weekDeliveries: weekDeliveryRows.length,
  };
}

// ── Phase 5 — Restaurant Intelligence ────────────────────────────────────────

export const getRestaurantIntelligence = async ({ days = 7 } = {}) => {
  const numDays = Number(days) || 7;
  return cacheOrFetch(`exec:restaurants:${numDays}`, () => _fetchRestaurantIntelligence(numDays), 600);
};

async function _fetchRestaurantIntelligence(numDays) {
  const start = windowStart(numDays);

  const [orders, restaurants, prepOrders] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: start } },
      select: { restaurantId: true, status: true, total: true },
    }),
    prisma.restaurant.findMany({
      select: { id: true, name: true, rating: true, isOpen: true, suspended: true },
    }),
    prisma.order.findMany({
      where: { readyAt: { not: null }, createdAt: { gte: start } },
      select: { restaurantId: true, placedAt: true, readyAt: true },
    }),
  ]);

  // Aggregate per restaurant
  const byId = new Map(
    restaurants.map((r) => [r.id, {
      restaurantId: r.id,
      name: r.name,
      rating: r.rating,
      isOpen: r.isOpen,
      suspended: r.suspended,
      revenue: 0,
      orderVolume: 0,
      delivered: 0,
      prepTotal: 0,
      prepCount: 0,
    }])
  );

  for (const o of orders) {
    const r = byId.get(o.restaurantId);
    if (!r) continue;
    r.orderVolume++;
    if (o.status === "DELIVERED") { r.delivered++; r.revenue += Number(o.total ?? 0); }
  }

  for (const o of prepOrders) {
    const r = byId.get(o.restaurantId);
    if (!r || !o.readyAt || !o.placedAt) continue;
    const m = (new Date(o.readyAt) - new Date(o.placedAt)) / 60000;
    if (m >= 0 && m <= 180) { r.prepTotal += m; r.prepCount++; }
  }

  const all = Array.from(byId.values()).map((r) => ({
    ...r,
    avgPrepMin: r.prepCount > 0 ? Math.round(r.prepTotal / r.prepCount) : null,
    cancellationRate: r.orderVolume > 0 ? Math.round(((r.orderVolume - r.delivered) / r.orderVolume) * 100) : 0,
  }));

  const withPrep = all.filter((r) => r.avgPrepMin != null);

  return {
    topByRevenue: [...all].sort((a, b) => b.revenue - a.revenue).slice(0, 10),
    topByRating: [...all].sort((a, b) => b.rating - a.rating).slice(0, 10),
    fastest: [...withPrep].sort((a, b) => a.avgPrepMin - b.avgPrepMin).slice(0, 10),
    slowest: [...withPrep].sort((a, b) => b.avgPrepMin - a.avgPrepMin).slice(0, 10),
    days: numDays,
  };
}

// ── Phase 6 — Customer Intelligence ──────────────────────────────────────────

export const getCustomerIntelligence = async ({ days = 30 } = {}) => {
  const numDays = Number(days) || 30;
  return cacheOrFetch(`exec:customers:${numDays}`, () => _fetchCustomerIntelligence(numDays), 600);
};

async function _fetchCustomerIntelligence(numDays) {
  const start = windowStart(numDays);

  const [
    windowOrderGroups,    // orders per customer in current window
    allFirstOrders,       // each customer's first-ever order date
    deliveredAov,         // for avg order value
    retentionBuckets,     // retention: customers who ordered both windows
  ] = await Promise.all([
    prisma.order.groupBy({
      by: ["customerId"],
      where: { createdAt: { gte: start } },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ["customerId"],
      _min: { createdAt: true },
    }),
    prisma.order.aggregate({
      _sum: { total: true },
      _count: { id: true },
      where: { status: "DELIVERED", createdAt: { gte: start } },
    }),
    // Retention: customers in prev window
    prisma.order.groupBy({
      by: ["customerId"],
      where: {
        createdAt: {
          gte: (() => { const d = windowStart(numDays); d.setDate(d.getDate() - numDays); return d; })(),
          lt: windowStart(numDays),
        },
      },
      _count: { id: true },
    }),
  ]);

  // Map: customerId → first-ever order date
  const firstOrderDate = new Map(allFirstOrders.map((r) => [r.customerId, r._min.createdAt]));

  // Customers who ordered in current window
  const windowCustomers = new Set(windowOrderGroups.map((r) => r.customerId));

  let newCustomers = 0;
  let returningCustomers = 0;
  let repeatCustomers = 0; // ordered 2+ times in window

  for (const r of windowOrderGroups) {
    const firstDate = firstOrderDate.get(r.customerId);
    const isNew = firstDate && new Date(firstDate) >= start;
    if (isNew) newCustomers++;
    else returningCustomers++;
    if (r._count.id >= 2) repeatCustomers++;
  }

  const totalWindowCustomers = windowCustomers.size;

  // Avg order value (paise)
  const avgOrderValuePaise = deliveredAov._count.id > 0
    ? Math.round(Number(deliveredAov._sum.total ?? 0) / deliveredAov._count.id)
    : 0;

  // Retention: % of prev-window customers who also ordered this window
  const prevCustomers = new Set(retentionBuckets.map((r) => r.customerId));
  const retained = [...prevCustomers].filter((id) => windowCustomers.has(id)).length;
  const retentionRate = prevCustomers.size > 0
    ? Math.round((retained / prevCustomers.size) * 100)
    : null;

  return {
    totalCustomers: totalWindowCustomers,
    newCustomers,
    returningCustomers,
    repeatCustomers,
    newPct: totalWindowCustomers > 0 ? Math.round((newCustomers / totalWindowCustomers) * 100) : 0,
    returningPct: totalWindowCustomers > 0 ? Math.round((returningCustomers / totalWindowCustomers) * 100) : 0,
    repeatPct: totalWindowCustomers > 0 ? Math.round((repeatCustomers / totalWindowCustomers) * 100) : 0,
    avgOrderValuePaise,
    retentionRate,
    prevWindowCustomers: prevCustomers.size,
    retainedCustomers: retained,
    days: numDays,
  };
}

// ── Phase 7 — Executive Summary ───────────────────────────────────────────────

export const getExecutiveSummary = async ({ period = "weekly" } = {}) => {
  const ttl = period === "daily" ? 300 : period === "monthly" ? 1800 : 600;
  return cacheOrFetch(`exec:summary:${period}`, () => _buildSummary(period), ttl);
};

async function _buildSummary(period) {
  const days = period === "daily" ? 1 : period === "monthly" ? 30 : 7;

  // Fetch KPIs, fleet and customer stats in parallel
  const [kpis, fleet, customers] = await Promise.all([
    _fetchKpis(),
    _fetchFleet(),
    _fetchCustomerIntelligence(days),
  ]);

  const { revenue, orders, platform } = kpis;

  const wins = [];
  const risks = [];
  const recommendations = [];

  // ── Wins ──
  if (platform.orderSuccessRate != null && platform.orderSuccessRate >= 85) {
    wins.push(`Order success rate is strong at ${platform.orderSuccessRate}%.`);
  }
  if (revenue.growthWeekPct != null && revenue.growthWeekPct > 5) {
    wins.push(`Revenue grew ${revenue.growthWeekPct}% week-over-week.`);
  }
  if (platform.avgDeliveryMin != null && platform.avgDeliveryMin <= 35) {
    wins.push(`Average delivery time of ${platform.avgDeliveryMin} min is within the 35-min target.`);
  }
  if (fleet.utilizationPct >= 70) {
    wins.push(`Fleet utilization at ${fleet.utilizationPct}% — riders are productively deployed.`);
  }
  if (platform.customerSatisfaction != null && platform.customerSatisfaction >= 80) {
    wins.push(`Customer satisfaction score of ${platform.satisfactionRating}/5 (${platform.customerSatisfaction}/100) is excellent.`);
  }
  if (customers.retentionRate != null && customers.retentionRate >= 60) {
    wins.push(`Customer retention rate of ${customers.retentionRate}% is healthy.`);
  }

  // ── Risks ──
  if (platform.cancellationRate != null && platform.cancellationRate >= 15) {
    risks.push(`High cancellation rate at ${platform.cancellationRate}% — exceeds the 15% warning threshold.`);
  }
  if (platform.avgDeliveryMin != null && platform.avgDeliveryMin > 50) {
    risks.push(`Average delivery time of ${platform.avgDeliveryMin} min exceeds the 50-min benchmark.`);
  }
  if (fleet.onDuty < 3) {
    risks.push(`Only ${fleet.onDuty} rider(s) on duty — capacity risk during demand spikes.`);
  }
  if (revenue.growthWeekPct != null && revenue.growthWeekPct < -10) {
    risks.push(`Revenue fell ${Math.abs(revenue.growthWeekPct)}% week-over-week.`);
  }
  if (platform.avgPrepMin != null && platform.avgPrepMin > 30) {
    risks.push(`Average restaurant prep time of ${platform.avgPrepMin} min is slowing total delivery speed.`);
  }
  if (customers.retentionRate != null && customers.retentionRate < 30) {
    risks.push(`Customer retention rate of ${customers.retentionRate}% is low — churn is high.`);
  }

  // ── Recommendations ──
  if (platform.cancellationRate != null && platform.cancellationRate >= 10) {
    recommendations.push("Review top cancellation reasons in Ops Intelligence → Incidents to identify systemic issues.");
  }
  if (platform.avgPrepMin != null && platform.avgPrepMin > 25) {
    recommendations.push("Flag slow-prep restaurants (Ops → Restaurant Intelligence) and provide operational guidance.");
  }
  if (fleet.utilizationPct < 40 && fleet.onDuty > 0) {
    recommendations.push(`Fleet utilization is low (${fleet.utilizationPct}%). Consider reducing on-duty hours or redistributing riders by zone.`);
  }
  if (customers.newPct < 20) {
    recommendations.push("New customer acquisition is low. Consider promotional campaigns or coupon incentives for first-time users.");
  }
  if (platform.orderSuccessRate != null && platform.orderSuccessRate < 70) {
    recommendations.push("Order success rate is below 70%. Investigate stuck/cancelled orders in the Ops Intelligence dashboard.");
  }
  if (fleet.avgOrdersPerRider < 2 && fleet.totalRiders > 0) {
    recommendations.push("Riders are averaging fewer than 2 deliveries per session. Review assignment logic and coverage zones.");
  }
  if (wins.length === 0) {
    recommendations.push("Focus on improving order success rate, delivery speed, and rider utilization to drive platform health.");
  }

  // Period-specific label
  const periodLabel = { daily: "Today", weekly: "This Week", monthly: "This Month" }[period] ?? "This Period";

  return {
    period,
    periodLabel,
    generatedAt: new Date().toISOString(),
    headline: {
      orders: period === "daily" ? orders.today : period === "monthly" ? orders.month : orders.week,
      revenue: period === "daily" ? revenue.today : period === "monthly" ? revenue.month : revenue.week,
      revenueGrowthPct: period === "monthly" ? revenue.growthMonthPct : revenue.growthWeekPct,
    },
    wins,
    risks,
    recommendations,
    snapshot: {
      activeRestaurants: platform.activeRestaurants,
      activeRiders: platform.activeRiders,
      avgDeliveryMin: platform.avgDeliveryMin,
      orderSuccessRate: platform.orderSuccessRate,
      cancellationRate: platform.cancellationRate,
      customerSatisfaction: platform.customerSatisfaction,
      fleetUtilization: fleet.utilizationPct,
      retentionRate: customers.retentionRate,
    },
  };
}
