"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { toRupees } from "@/lib/utils";
import { TrendingUp, ShoppingBag, DollarSign, BarChart2 } from "lucide-react";

const STATUS_COLOR: Record<string, string> = {
  PLACED: "bg-blue-400",
  CONFIRMED: "bg-indigo-400",
  PREPARING: "bg-yellow-400",
  OUT_FOR_DELIVERY: "bg-orange-400",
  DELIVERED: "bg-green-400",
  CANCELLED: "bg-red-400",
  PENDING: "bg-gray-400",
};

export default function AdminAnalyticsPage() {
  const [days, setDays] = useState(7);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-analytics", days],
    queryFn: () => api.get(`/admin/analytics?days=${days}`).then((r) => r.data),
    refetchInterval: 60_000,
  });

  const trend: { date: string; orders: number; revenue: number }[] = data?.trend ?? [];
  const statusBreakdown: Record<string, number> = data?.statusBreakdown ?? {};
  const topRestaurants: { restaurantId: string; name: string; revenue: number; orders: number }[] = data?.topRestaurants ?? [];
  const summary = data?.summary ?? { totalOrders: 0, deliveredOrders: 0, totalRevenue: 0 };
  const delivery = data?.delivery ?? {
    totalRiderPayouts: 0, totalRestaurantPayouts: 0, totalAdminRevenue: 0, totalDeliveryFees: 0,
    avgRiderPayout: 0, avgRestaurantPayout: 0, avgDistanceKm: 0,
    cancellationPct: 0, avgPrepTimeMin: null, avgAssignmentTimeMin: null, avgDeliveryTimeMin: null,
    avgOrderValue: 0, repeatCustomerPct: 0, onTimePct: null, riderUtilizationPct: null, restaurantUtilizationPct: null,
  };

  const maxRevenue = Math.max(...trend.map((d) => d.revenue), 1);
  const maxOrders = Math.max(...trend.map((d) => d.orders), 1);
  const totalStatusCount = Object.values(statusBreakdown).reduce((a, b) => a + b, 0) || 1;
  const deliveryRate = summary.totalOrders > 0
    ? Math.round((summary.deliveredOrders / summary.totalOrders) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Insights</p>
          <h1 className="mt-2 text-3xl font-bold text-text-primary">Analytics</h1>
          <p className="mt-2 text-sm text-text-secondary">Platform-wide performance metrics.</p>
        </div>
        <div className="flex gap-1.5">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                days === d
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-white text-text-secondary hover:border-brand/30"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total orders", value: summary.totalOrders, icon: ShoppingBag, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Delivered", value: summary.deliveredOrders, icon: TrendingUp, color: "text-green-600", bg: "bg-green-50" },
          { label: "Revenue", value: `₹${toRupees(summary.totalRevenue).toLocaleString("en-IN")}`, icon: DollarSign, color: "text-brand", bg: "bg-orange-50" },
          { label: "Delivery rate", value: `${deliveryRate}%`, icon: BarChart2, color: "text-indigo-600", bg: "bg-indigo-50" },
        ].map((s) => (
          <div key={s.label} className="rounded-[18px] border border-border bg-white p-5">
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${s.bg}`}>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <p className="text-sm text-text-muted">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-text-primary">{isLoading ? "—" : s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Revenue trend */}
        <div className="lg:col-span-2 rounded-[20px] border border-border bg-white p-6">
          <h2 className="mb-4 font-semibold text-text-primary">Revenue trend ({days} days)</h2>
          {isLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
          ) : (
            <div className="flex h-48 items-end gap-1.5">
              {trend.map((d) => {
                const height = Math.round((d.revenue / maxRevenue) * 100);
                return (
                  <div key={d.date} className="group relative flex flex-1 flex-col items-center">
                    <div
                      className="w-full rounded-t-md bg-brand/70 transition-all group-hover:bg-brand"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                    <p className="mt-1.5 text-[10px] text-text-muted">{d.date.slice(5)}</p>
                    <div className="pointer-events-none absolute bottom-full mb-2 hidden rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs shadow-md group-hover:block whitespace-nowrap">
                      <p className="font-semibold">₹{toRupees(d.revenue).toLocaleString("en-IN")}</p>
                      <p className="text-text-muted">{d.orders} orders</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div className="rounded-[20px] border border-border bg-white p-6">
          <h2 className="mb-4 font-semibold text-text-primary">Order status mix</h2>
          {isLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
          ) : (
            <div className="space-y-2.5">
              {Object.entries(statusBreakdown)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <div key={status}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="font-medium text-text-secondary">{status}</span>
                      <span className="text-text-muted">
                        {count} ({Math.round((count / totalStatusCount) * 100)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${STATUS_COLOR[status] ?? "bg-gray-400"}`}
                        style={{ width: `${Math.round((count / totalStatusCount) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Order volume */}
      <div className="rounded-[20px] border border-border bg-white p-6">
        <h2 className="mb-4 font-semibold text-text-primary">Order volume ({days} days)</h2>
        {isLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
        ) : (
          <div className="flex h-32 items-end gap-1.5">
            {trend.map((d) => {
              const height = Math.round((d.orders / maxOrders) * 100);
              return (
                <div key={d.date} className="group relative flex flex-1 flex-col items-center">
                  <div
                    className="w-full rounded-t-md bg-indigo-400/70 transition-all group-hover:bg-indigo-500"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                  <p className="mt-1.5 text-[10px] text-text-muted">{d.date.slice(5)}</p>
                  <div className="pointer-events-none absolute bottom-full mb-2 hidden rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs shadow-md group-hover:block">
                    <p className="font-semibold">{d.orders} orders</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delivery metrics */}
      <div className="rounded-[20px] border border-border bg-white p-6">
        <h2 className="mb-4 font-semibold text-text-primary">Delivery performance</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Rider payouts", value: `₹${toRupees(delivery.totalRiderPayouts).toLocaleString("en-IN")}`, sub: `avg ₹${toRupees(delivery.avgRiderPayout)} / order` },
            { label: "Restaurant payouts", value: `₹${toRupees(delivery.totalRestaurantPayouts).toLocaleString("en-IN")}`, sub: `avg ₹${toRupees(delivery.avgRestaurantPayout)} / order` },
            { label: "Platform revenue", value: `₹${toRupees(delivery.totalAdminRevenue).toLocaleString("en-IN")}`, sub: "admin net share" },
            { label: "Delivery fees collected", value: `₹${toRupees(delivery.totalDeliveryFees).toLocaleString("en-IN")}`, sub: "charged to customers" },
            { label: "Cancellation rate", value: `${delivery.cancellationPct}%`, sub: "of all orders this period" },
            { label: "Avg distance", value: `${delivery.avgDistanceKm} km`, sub: "per delivered order" },
            { label: "Avg prep time", value: delivery.avgPrepTimeMin != null ? `${delivery.avgPrepTimeMin} min` : "—", sub: "restaurant accept → pickup" },
            { label: "Avg assignment time", value: delivery.avgAssignmentTimeMin != null ? `${delivery.avgAssignmentTimeMin} min` : "—", sub: "placed → rider accepts" },
            { label: "Avg delivery time", value: delivery.avgDeliveryTimeMin != null ? `${delivery.avgDeliveryTimeMin} min` : "—", sub: "placed → delivered" },
            { label: "Avg order value", value: `₹${toRupees(delivery.avgOrderValue ?? 0).toLocaleString("en-IN")}`, sub: "per delivered order" },
            { label: "Repeat customers", value: `${delivery.repeatCustomerPct ?? 0}%`, sub: "placed >1 order this period" },
            { label: "On-time delivery", value: `${delivery.onTimePct ?? 0}%`, sub: "delivered ≤ ETA" },
            { label: "Rider utilization", value: `${delivery.riderUtilizationPct ?? 0}%`, sub: "active riders / total riders" },
            { label: "Restaurant utilization", value: `${delivery.restaurantUtilizationPct ?? 0}%`, sub: "active restaurants / total" },
          ].map((m) => (
            <div key={m.label} className="rounded-[14px] border border-border p-4">
              <p className="text-xs text-text-muted">{m.label}</p>
              <p className="mt-1 text-xl font-bold text-text-primary">{isLoading ? "—" : m.value}</p>
              <p className="mt-0.5 text-xs text-text-muted">{m.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Top restaurants */}
      <div className="rounded-[20px] border border-border bg-white p-6">
        <h2 className="mb-4 font-semibold text-text-primary">Top restaurants by revenue</h2>
        {isLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
        ) : topRestaurants.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">No delivered orders in this period.</p>
        ) : (
          <div className="space-y-3">
            {topRestaurants.map((r, i) => (
              <div key={r.restaurantId} className="flex items-center gap-4">
                <span className="w-5 text-sm font-bold text-text-muted">#{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-text-primary">{r.name}</p>
                  <p className="text-xs text-text-muted">{r.orders} orders</p>
                </div>
                <span className="font-semibold text-text-primary">
                  ₹{toRupees(r.revenue).toLocaleString("en-IN")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
