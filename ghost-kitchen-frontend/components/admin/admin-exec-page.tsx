"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, Minus,
  ShoppingBag, Wallet, Store, Bike, Star,
  Users, Clock, CheckCircle2, XCircle,
  Trophy, Zap, AlertTriangle, Lightbulb,
  BarChart2,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// ── Type definitions ──────────────────────────────────────────────────────────

interface KpiData {
  revenue: { today: number; week: number; month: number; growthWeekPct: number | null; growthMonthPct: number | null };
  orders: { today: number; week: number; month: number; growthWeekPct: number | null; growthMonthPct: number | null };
  platform: {
    activeRestaurants: number; activeRiders: number;
    avgDeliveryMin: number | null; avgPrepMin: number | null;
    customerSatisfaction: number | null; satisfactionRating: number | null; reviewCount: number;
    orderSuccessRate: number | null; cancellationRate: number | null;
  };
}

interface TrendPoint { date: string; revenue?: number; orders?: number; total?: number; cancelled?: number; cancellationRate?: number; avgMin?: number | null; rate?: number }

interface TrendsData {
  days: number;
  revenue: TrendPoint[];
  orders: TrendPoint[];
  deliveryTime: TrendPoint[];
  cancellation: TrendPoint[];
}

interface FleetData {
  totalRiders: number; onDuty: number; active: number; idle: number;
  utilizationPct: number; avgOrdersPerRider: number; avgDeliveryDurationMin: number | null;
  avgActiveHoursPerRider: number; weekDeliveries: number;
}

interface RestaurantRow {
  restaurantId: string; name: string; rating: number; revenue?: number;
  avgPrepMin?: number | null; orderVolume?: number;
}

interface RestaurantData {
  topByRevenue: RestaurantRow[]; topByRating: RestaurantRow[];
  fastest: RestaurantRow[]; slowest: RestaurantRow[];
}

interface CustomerData {
  totalCustomers: number; newCustomers: number; returningCustomers: number; repeatCustomers: number;
  newPct: number; returningPct: number; repeatPct: number;
  avgOrderValuePaise: number; retentionRate: number | null;
}

interface SummaryData {
  period: string; periodLabel: string; generatedAt: string;
  headline: { orders: number; revenue: number; revenueGrowthPct: number | null };
  wins: string[]; risks: string[]; recommendations: string[];
  snapshot: { activeRestaurants: number; activeRiders: number; avgDeliveryMin: number | null; orderSuccessRate: number | null; cancellationRate: number | null; customerSatisfaction: number | null; fleetUtilization: number; retentionRate: number | null };
}

// ── Utility helpers ───────────────────────────────────────────────────────────

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;

const fmtDate = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

// ── Reusable KPI card (Phase 3) ───────────────────────────────────────────────

type KpiState = "healthy" | "warning" | "critical" | "neutral";

interface KpiCardProps {
  label: string;
  value: string;
  subtitle?: string;
  delta?: number | null;
  state?: KpiState;
  icon: React.ElementType;
}

const STATE_STYLES: Record<KpiState, string> = {
  healthy: "border-green-200 bg-green-50",
  warning: "border-amber-200 bg-amber-50",
  critical: "border-red-200 bg-red-50",
  neutral: "border-border bg-white",
};

const STATE_ICON_BG: Record<KpiState, string> = {
  healthy: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
  neutral: "bg-[#FFF3EE] text-[#FF5200]",
};

function DeltaArrow({ delta }: { delta: number | null }) {
  if (delta == null) return null;
  if (Math.abs(delta) <= 1) return <span className="flex items-center gap-0.5 text-xs text-text-muted"><Minus className="h-3 w-3" />{delta}%</span>;
  const up = delta > 0;
  return (
    <span className={cn("flex items-center gap-0.5 text-xs font-semibold", up ? "text-green-600" : "text-red-500")}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{delta}%
    </span>
  );
}

function KpiCard({ label, value, subtitle, delta, state = "neutral", icon: Icon }: KpiCardProps) {
  return (
    <div className={cn("rounded-2xl border p-5 transition", STATE_STYLES[state])}>
      <div className="flex items-start justify-between">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-xl", STATE_ICON_BG[state])}>
          <Icon className="h-4 w-4" />
        </div>
        <DeltaArrow delta={delta ?? null} />
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-text-primary">{value}</p>
      {subtitle && <p className="mt-0.5 text-xs text-text-secondary">{subtitle}</p>}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon: React.ElementType }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFF3EE] text-[#FF5200]">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-text-primary">{title}</h2>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-text-secondary mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {formatter ? formatter(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const DAYS_OPTIONS = [7, 30, 90] as const;
type DaysOption = (typeof DAYS_OPTIONS)[number];
const PERIOD_OPTIONS = ["daily", "weekly", "monthly"] as const;
type PeriodOption = (typeof PERIOD_OPTIONS)[number];

export function AdminExecPage() {
  const [trendDays, setTrendDays] = useState<DaysOption>(7);
  const [summaryPeriod, setSummaryPeriod] = useState<PeriodOption>("weekly");

  // ── Queries ────────────────────────────────────────────────────────────────

  const kpisQ = useQuery<KpiData>({
    queryKey: ["exec-kpis"],
    queryFn: () => api.get("/exec/kpis").then((r) => r.data),
    refetchInterval: 300_000, // 5 min
  });

  const trendsQ = useQuery<TrendsData>({
    queryKey: ["exec-trends", trendDays],
    queryFn: () => api.get(`/exec/trends?days=${trendDays}`).then((r) => r.data),
    refetchInterval: 600_000,
  });

  const fleetQ = useQuery<FleetData>({
    queryKey: ["exec-fleet"],
    queryFn: () => api.get("/exec/fleet").then((r) => r.data),
    refetchInterval: 120_000, // 2 min
  });

  const restaurantsQ = useQuery<RestaurantData>({
    queryKey: ["exec-restaurants", trendDays],
    queryFn: () => api.get(`/exec/restaurants?days=${trendDays}`).then((r) => r.data),
    refetchInterval: 600_000,
  });

  const customersQ = useQuery<CustomerData>({
    queryKey: ["exec-customers", trendDays],
    queryFn: () => api.get(`/exec/customers?days=${trendDays}`).then((r) => r.data),
    refetchInterval: 600_000,
  });

  const summaryQ = useQuery<SummaryData>({
    queryKey: ["exec-summary", summaryPeriod],
    queryFn: () => api.get(`/exec/summary?period=${summaryPeriod}`).then((r) => r.data),
    refetchInterval: 600_000,
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const kpis = kpisQ.data;
  const trends = trendsQ.data;
  const fleet = fleetQ.data;
  const restaurants = restaurantsQ.data;
  const customers = customersQ.data;
  const summary = summaryQ.data;

  const kpiState = (val: number | null, warnThreshold: number, critThreshold: number, higherIsBetter = true): KpiState => {
    if (val == null) return "neutral";
    const ok = higherIsBetter ? val >= critThreshold : val <= critThreshold;
    const warn = higherIsBetter ? val >= warnThreshold : val <= warnThreshold;
    if (ok) return "healthy";
    if (warn) return "warning";
    return "critical";
  };

  // ── Loading skeleton ───────────────────────────────────────────────────────

  if (kpisQ.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Executive</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Analytics Dashboard</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Real-time executive view of platform health, revenue, fleet, and customers.
        </p>
      </div>

      {/* ── Phase 1 + 3: Executive KPI Widgets ─────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader title="Executive KPIs" subtitle="Key metrics vs prior period" icon={BarChart2} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Revenue This Week" value={kpis ? rupees(kpis.revenue.week) : "—"}
            subtitle={kpis ? `Today: ${rupees(kpis.revenue.today)}` : undefined}
            delta={kpis?.revenue.growthWeekPct ?? null} icon={Wallet}
            state={kpiState(kpis?.revenue.growthWeekPct ?? null, 0, 10)} />

          <KpiCard label="Revenue This Month" value={kpis ? rupees(kpis.revenue.month) : "—"}
            delta={kpis?.revenue.growthMonthPct ?? null} icon={Wallet}
            state={kpiState(kpis?.revenue.growthMonthPct ?? null, 0, 5)} />

          <KpiCard label="Orders Today" value={kpis ? String(kpis.orders.today) : "—"}
            subtitle={kpis ? `Week: ${kpis.orders.week} · Month: ${kpis.orders.month}` : undefined}
            delta={kpis?.orders.growthWeekPct ?? null} icon={ShoppingBag}
            state={kpiState(kpis?.orders.growthWeekPct ?? null, 0, 5)} />

          <KpiCard label="Order Success Rate" value={kpis?.platform.orderSuccessRate != null ? `${kpis.platform.orderSuccessRate}%` : "—"}
            subtitle="Last 30 days" icon={CheckCircle2}
            state={kpiState(kpis?.platform.orderSuccessRate ?? null, 80, 90)} />

          <KpiCard label="Active Restaurants" value={kpis ? String(kpis.platform.activeRestaurants) : "—"}
            icon={Store} state="neutral" />

          <KpiCard label="Active Riders" value={kpis ? String(kpis.platform.activeRiders) : "—"}
            icon={Bike} state="neutral" />

          <KpiCard label="Avg Delivery Time"
            value={kpis?.platform.avgDeliveryMin != null ? `${kpis.platform.avgDeliveryMin} min` : "—"}
            subtitle="Last 7 days" icon={Clock}
            state={kpiState(kpis?.platform.avgDeliveryMin ?? null, 50, 35, false)} />

          <KpiCard label="Avg Prep Time"
            value={kpis?.platform.avgPrepMin != null ? `${kpis.platform.avgPrepMin} min` : "—"}
            subtitle="Last 7 days" icon={Clock}
            state={kpiState(kpis?.platform.avgPrepMin ?? null, 30, 20, false)} />

          <KpiCard label="Customer Satisfaction"
            value={kpis?.platform.satisfactionRating != null ? `${kpis.platform.satisfactionRating}/5` : "—"}
            subtitle={kpis?.platform.reviewCount ? `${kpis.platform.reviewCount} reviews` : undefined}
            icon={Star}
            state={kpiState(kpis?.platform.customerSatisfaction ?? null, 70, 80)} />

          <KpiCard label="Cancellation Rate"
            value={kpis?.platform.cancellationRate != null ? `${kpis.platform.cancellationRate}%` : "—"}
            subtitle="Last 30 days" icon={XCircle}
            state={kpiState(kpis?.platform.cancellationRate ?? null, 10, 5, false)} />

          <KpiCard label="Orders This Week" value={kpis ? String(kpis.orders.week) : "—"}
            delta={kpis?.orders.growthWeekPct ?? null} icon={ShoppingBag}
            state={kpiState(kpis?.orders.growthWeekPct ?? null, 0, 5)} />

          <KpiCard label="Orders This Month" value={kpis ? String(kpis.orders.month) : "—"}
            delta={kpis?.orders.growthMonthPct ?? null} icon={ShoppingBag}
            state={kpiState(kpis?.orders.growthMonthPct ?? null, 0, 5)} />
        </div>
      </section>

      {/* ── Phase 2: Trend Analytics ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <SectionHeader title="Trend Analytics" subtitle="Revenue, orders, delivery & cancellation" icon={TrendingUp} />
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {DAYS_OPTIONS.map((d) => (
              <button key={d} type="button"
                onClick={() => setTrendDays(d)}
                className={cn("rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                  trendDays === d ? "bg-brand text-white" : "text-text-secondary hover:text-text-primary")}>
                {d}d
              </button>
            ))}
          </div>
        </div>

        {trendsQ.isLoading ? (
          <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Revenue trend */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Revenue (₹)</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trends?.revenue ?? []} margin={{ left: -10, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => `₹${Math.round(v / 100)}`} tick={{ fontSize: 10 }} width={60} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => rupees(v)} />} />
                  <Line type="monotone" dataKey="revenue" stroke="#FF5200" strokeWidth={2} dot={false} name="Revenue" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Orders trend */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Orders per day</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={trends?.orders ?? []} margin={{ left: -10, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={30} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="total" fill="#FF5200" radius={[3, 3, 0, 0]} name="Orders" />
                  <Bar dataKey="cancelled" fill="#EF4444" radius={[3, 3, 0, 0]} name="Cancelled" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Delivery time trend */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Avg Delivery Time (min)</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trends?.deliveryTime ?? []} margin={{ left: -10, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={35} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v} min`} />} />
                  <Line type="monotone" dataKey="avgMin" stroke="#7C4DFF" strokeWidth={2} dot={false} name="Avg time" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Cancellation rate trend */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Cancellation Rate (%)</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trends?.cancellation ?? []} margin={{ left: -10, right: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} width={30} domain={[0, 100]} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}%`} />} />
                  <Line type="monotone" dataKey="rate" stroke="#EF4444" strokeWidth={2} dot={false} name="Cancel %" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

      {/* ── Phase 4: Fleet Utilization ────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-6">
        <SectionHeader title="Fleet Utilization" subtitle="Live and last-7-day delivery stats" icon={Bike} />
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "On Duty", value: fleet?.onDuty ?? "—", sub: `of ${fleet?.totalRiders ?? 0} riders` },
            { label: "Active Now", value: fleet?.active ?? "—", sub: "currently delivering" },
            { label: "Idle", value: fleet?.idle ?? "—", sub: "on duty, no order" },
            { label: "Utilization", value: fleet ? `${fleet.utilizationPct}%` : "—", sub: "active / on-duty" },
            { label: "Avg Orders/Rider", value: fleet?.avgOrdersPerRider ?? "—", sub: "last 7 days" },
            { label: "Avg Delivery Time", value: fleet?.avgDeliveryDurationMin != null ? `${fleet.avgDeliveryDurationMin} min` : "—", sub: "last 7 days" },
            { label: "Avg Active Hours", value: fleet ? `${fleet.avgActiveHoursPerRider}h` : "—", sub: "per rider/week" },
            { label: "Week Deliveries", value: fleet?.weekDeliveries ?? "—", sub: "last 7 days" },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border px-4 py-3">
              <p className="text-xs text-text-muted">{item.label}</p>
              <p className="mt-1 text-2xl font-bold text-text-primary">{fleetQ.isLoading ? "—" : item.value}</p>
              <p className="text-[10px] text-text-muted">{item.sub}</p>
            </div>
          ))}
        </div>

        {fleet && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-text-muted mb-1">
              <span>Fleet utilization</span>
              <span>{fleet.utilizationPct}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={cn("h-2 rounded-full transition-all", fleet.utilizationPct >= 70 ? "bg-green-500" : fleet.utilizationPct >= 40 ? "bg-amber-400" : "bg-red-400")}
                style={{ width: `${fleet.utilizationPct}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Phase 5: Restaurant Intelligence ─────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-6 space-y-4">
        <SectionHeader title="Restaurant Intelligence" icon={Store} subtitle={`Last ${trendDays} days`} />
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top by revenue */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Top by Revenue</p>
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
                <tr><th className="px-2 py-1">#</th><th className="px-2 py-1">Restaurant</th><th className="px-2 py-1 text-right">Revenue</th></tr>
              </thead>
              <tbody>
                {restaurantsQ.isLoading ? (
                  <tr><td colSpan={3} className="py-4 text-center text-xs text-text-muted">Loading…</td></tr>
                ) : (restaurants?.topByRevenue ?? []).slice(0, 5).map((r, i) => (
                  <tr key={r.restaurantId} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 text-xs font-mono text-text-muted">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium">{r.name}</td>
                    <td className="px-2 py-1.5 text-right font-semibold">{r.revenue != null ? rupees(r.revenue) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top by rating */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Highest Rated</p>
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
                <tr><th className="px-2 py-1">#</th><th className="px-2 py-1">Restaurant</th><th className="px-2 py-1 text-right">Rating</th></tr>
              </thead>
              <tbody>
                {restaurantsQ.isLoading ? (
                  <tr><td colSpan={3} className="py-4 text-center text-xs text-text-muted">Loading…</td></tr>
                ) : (restaurants?.topByRating ?? []).slice(0, 5).map((r, i) => (
                  <tr key={r.restaurantId} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 text-xs font-mono text-text-muted">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium">{r.name}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-amber-600">{r.rating.toFixed(1)} ★</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Fastest */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Fastest Prep</p>
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
                <tr><th className="px-2 py-1">#</th><th className="px-2 py-1">Restaurant</th><th className="px-2 py-1 text-right">Avg Prep</th></tr>
              </thead>
              <tbody>
                {restaurantsQ.isLoading ? (
                  <tr><td colSpan={3} className="py-4 text-center text-xs text-text-muted">Loading…</td></tr>
                ) : (restaurants?.fastest ?? []).slice(0, 5).length === 0 ? (
                  <tr><td colSpan={3} className="py-3 text-center text-xs text-text-muted">No prep-time data yet.</td></tr>
                ) : (restaurants?.fastest ?? []).slice(0, 5).map((r, i) => (
                  <tr key={r.restaurantId} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 text-xs font-mono text-text-muted">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium">{r.name}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-green-600">{r.avgPrepMin} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Slowest */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Slowest Prep</p>
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-wide text-text-muted">
                <tr><th className="px-2 py-1">#</th><th className="px-2 py-1">Restaurant</th><th className="px-2 py-1 text-right">Avg Prep</th></tr>
              </thead>
              <tbody>
                {restaurantsQ.isLoading ? (
                  <tr><td colSpan={3} className="py-4 text-center text-xs text-text-muted">Loading…</td></tr>
                ) : (restaurants?.slowest ?? []).slice(0, 5).length === 0 ? (
                  <tr><td colSpan={3} className="py-3 text-center text-xs text-text-muted">No prep-time data yet.</td></tr>
                ) : (restaurants?.slowest ?? []).slice(0, 5).map((r, i) => (
                  <tr key={r.restaurantId} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5 text-xs font-mono text-text-muted">{i + 1}</td>
                    <td className="px-2 py-1.5 font-medium">{r.name}</td>
                    <td className="px-2 py-1.5 text-right font-semibold text-red-500">{r.avgPrepMin} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── Phase 6: Customer Intelligence ───────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-6 space-y-4">
        <SectionHeader title="Customer Intelligence" icon={Users} subtitle={`Last ${trendDays} days`} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border px-4 py-3">
            <p className="text-xs text-text-muted">Total Customers</p>
            <p className="mt-1 text-2xl font-bold text-text-primary">{customersQ.isLoading ? "—" : customers?.totalCustomers}</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-xs text-green-700">New Customers</p>
            <p className="mt-1 text-2xl font-bold text-green-700">{customersQ.isLoading ? "—" : `${customers?.newPct ?? 0}%`}</p>
            <p className="text-[10px] text-green-600">{customers?.newCustomers} customers</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <p className="text-xs text-blue-700">Returning Customers</p>
            <p className="mt-1 text-2xl font-bold text-blue-700">{customersQ.isLoading ? "—" : `${customers?.returningPct ?? 0}%`}</p>
            <p className="text-[10px] text-blue-600">{customers?.returningCustomers} customers</p>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
            <p className="text-xs text-purple-700">Repeat Customers</p>
            <p className="mt-1 text-2xl font-bold text-purple-700">{customersQ.isLoading ? "—" : `${customers?.repeatPct ?? 0}%`}</p>
            <p className="text-[10px] text-purple-600">2+ orders this period</p>
          </div>
          <div className="rounded-xl border border-border px-4 py-3">
            <p className="text-xs text-text-muted">Avg Order Value</p>
            <p className="mt-1 text-2xl font-bold text-text-primary">{customersQ.isLoading ? "—" : customers ? rupees(customers.avgOrderValuePaise) : "—"}</p>
          </div>
          <div className={cn("rounded-xl border px-4 py-3", customers?.retentionRate != null && customers.retentionRate >= 60 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50")}>
            <p className="text-xs text-text-muted">Retention Rate</p>
            <p className="mt-1 text-2xl font-bold text-text-primary">{customersQ.isLoading ? "—" : customers?.retentionRate != null ? `${customers.retentionRate}%` : "—"}</p>
            <p className="text-[10px] text-text-muted">prev → current window</p>
          </div>
        </div>
      </section>

      {/* ── Phase 7: Executive Summary ────────────────────────────────────── */}
      <section className="rounded-2xl border border-border bg-white p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <SectionHeader title="Executive Summary" subtitle="AI-generated from real metrics" icon={Lightbulb} />
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {PERIOD_OPTIONS.map((p) => (
              <button key={p} type="button"
                onClick={() => setSummaryPeriod(p)}
                className={cn("rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors",
                  summaryPeriod === p ? "bg-brand text-white" : "text-text-secondary hover:text-text-primary")}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {summaryQ.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}
          </div>
        ) : summary ? (
          <>
            {/* Headline numbers */}
            <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-[#FAFAFA] px-5 py-4 text-sm">
              <div>
                <span className="text-text-muted">{summary.periodLabel} orders: </span>
                <span className="font-bold text-text-primary">{summary.headline.orders.toLocaleString("en-IN")}</span>
              </div>
              <div>
                <span className="text-text-muted">Revenue: </span>
                <span className="font-bold text-text-primary">{rupees(summary.headline.revenue)}</span>
              </div>
              {summary.headline.revenueGrowthPct != null && (
                <div className={cn("font-semibold", summary.headline.revenueGrowthPct >= 0 ? "text-green-600" : "text-red-500")}>
                  {summary.headline.revenueGrowthPct >= 0 ? "+" : ""}{summary.headline.revenueGrowthPct}% vs prior period
                </div>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Wins */}
              {summary.wins.length > 0 && (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Trophy className="h-4 w-4 text-green-600" />
                    <p className="text-sm font-bold text-green-700">Wins</p>
                  </div>
                  <ul className="space-y-2">
                    {summary.wins.map((w, i) => (
                      <li key={i} className="text-xs text-green-700 flex gap-2">
                        <span className="mt-0.5 text-green-500">✓</span>
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Risks */}
              {summary.risks.length > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-red-600" />
                    <p className="text-sm font-bold text-red-700">Risks</p>
                  </div>
                  <ul className="space-y-2">
                    {summary.risks.map((r, i) => (
                      <li key={i} className="text-xs text-red-700 flex gap-2">
                        <span className="mt-0.5 text-red-400">!</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {summary.recommendations.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="h-4 w-4 text-amber-600" />
                    <p className="text-sm font-bold text-amber-700">Actions</p>
                  </div>
                  <ul className="space-y-2">
                    {summary.recommendations.map((rec, i) => (
                      <li key={i} className="text-xs text-amber-700 flex gap-2">
                        <span className="mt-0.5 text-amber-500">→</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* No issues state */}
              {summary.wins.length === 0 && summary.risks.length === 0 && (
                <div className="col-span-3 py-6 text-center text-sm text-text-muted">
                  Insufficient data to generate a summary for this period.
                </div>
              )}
            </div>

            <p className="text-[10px] text-text-muted text-right">
              Generated at {new Date(summary.generatedAt).toLocaleString("en-IN")}
            </p>
          </>
        ) : null}
      </section>
    </div>
  );
}
