"use client";

import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bike,
  ShoppingBag,
  Store,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/ui/data-table";
import { getAdminDashboardData } from "@/lib/opsData";
import { cn } from "@/lib/utils";
import type { AdminAlert, AdminMetric, AdminOrderRow, TopRestaurantRow } from "@/types";

const metricIconMap = {
  ShoppingBag,
  Wallet,
  Store,
  Bike,
} as const;

const statusStyles: Record<AdminOrderRow["status"], string> = {
  PLACED: "bg-[#EEF4FF] text-[#2E6BFF]",
  CONFIRMED: "bg-brand-light text-brand",
  PREPARING: "bg-[#FFF5E5] text-warning",
  DELIVERING: "bg-[#F3EEFF] text-[#7C4DFF]",
  DELIVERED: "bg-success/10 text-success",
  CANCELLED: "bg-danger/10 text-danger",
};

function Sparkline({ points }: { points: number[] }) {
  const max = Math.max(...points);
  const min = Math.min(...points);
  const path = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 100 - ((point - min) / Math.max(max - min, 1)) * 100;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg className="h-10 w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
      <path d={path} fill="none" stroke="#FF5200" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="bone-loader h-36 rounded-[18px]" key={index} />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="bone-loader h-[360px] rounded-[20px]" />
        <div className="bone-loader h-[360px] rounded-[20px]" />
      </div>
      <div className="bone-loader h-[520px] rounded-[20px]" />
    </div>
  );
}

function MetricCard({ metric }: { metric: AdminMetric }) {
  const Icon = metricIconMap[metric.icon as keyof typeof metricIconMap] ?? TrendingUp;

  return (
    <div className="rounded-[18px] border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-light text-brand">
          <Icon className="h-5 w-5" />
        </div>
        <div
          className={cn(
            "text-xs font-semibold",
            metric.trend === "up" ? "text-success" : "text-text-muted",
          )}
        >
          {metric.change}
        </div>
      </div>
      <p className="mt-4 text-sm text-text-muted">{metric.label}</p>
      <p className="mt-2 text-2xl font-bold text-text-primary">{metric.value}</p>
      {metric.sparkline ? (
        <div className="mt-4">
          <Sparkline points={metric.sparkline} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-text-secondary">{metric.meta ?? metric.change}</p>
      )}
    </div>
  );
}

export function AdminDashboardPage() {
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderRow | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);

  const query = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: getAdminDashboardData,
  });

  const columns = useMemo<ColumnDef<AdminOrderRow>[]>(
    () => [
      {
        accessorKey: "id",
        header: "Order ID",
        cell: ({ row }) => (
          <span className="font-semibold text-text-primary">{row.original.id}</span>
        ),
      },
      { accessorKey: "customer", header: "Customer" },
      { accessorKey: "restaurant", header: "Restaurant" },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <span className="font-semibold text-text-primary">₹{row.original.amount}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex rounded-pill px-2.5 py-1 text-xs font-semibold",
              statusStyles[row.original.status],
            )}
          >
            {row.original.status}
          </span>
        ),
      },
      { accessorKey: "time", header: "Time" },
      {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
          <button
            className="rounded-pill border border-border px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-brand/30 hover:text-brand"
            onClick={() => setSelectedOrder(row.original)}
            type="button"
          >
            View
          </button>
        ),
      },
    ],
    [],
  );

  const topRestaurantColumns = useMemo<ColumnDef<TopRestaurantRow>[]>(
    () => [
      {
        accessorKey: "rank",
        header: "Rank",
        cell: ({ row }) => (
          <span className="font-semibold text-text-primary">#{row.original.rank}</span>
        ),
      },
      { accessorKey: "name", header: "Name" },
      { accessorKey: "orders", header: "Orders" },
      {
        accessorKey: "revenue",
        header: "Revenue",
        cell: ({ row }) => `₹${row.original.revenue.toLocaleString("en-IN")}`,
      },
      {
        accessorKey: "rating",
        header: "Rating",
        cell: ({ row }) => row.original.rating.toFixed(1),
      },
    ],
    [],
  );

  if (query.isLoading) {
    return <LoadingSkeleton />;
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-[20px] border border-border bg-white p-8 text-center">
        <h1 className="text-2xl font-bold text-text-primary">Dashboard unavailable</h1>
        <p className="mt-2 text-sm text-text-secondary">
          The operations feed could not be loaded right now.
        </p>
        <button
          className="mt-5 rounded-pill bg-brand px-5 py-3 text-sm font-semibold text-white"
          onClick={() => query.refetch()}
          type="button"
        >
          Retry
        </button>
      </div>
    );
  }

  const visibleAlerts = query.data.alerts.filter(
    (alert) => !dismissedAlerts.includes(alert.id),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
          Operations
        </p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Admin dashboard</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Monitor orders, restaurant health, and delivery flow in one place.
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-4">
        {query.data.metrics.map((metric) => (
          <MetricCard key={metric.id} metric={metric} />
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[20px] border border-border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-text-primary">Orders map view</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Pending orders in red, deliveries in green, kitchens in orange.
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-pill border border-success/20 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
              <span className="h-2.5 w-2.5 rounded-full bg-success track-pulse" />
              Live
            </span>
          </div>
          <div className="mt-5 flex h-[280px] items-center justify-center rounded-[18px] border border-dashed border-border bg-[#FCFCFC]">
            <div className="space-y-3 text-center">
              <div className="mx-auto flex w-fit items-center gap-3">
                <span className="h-3 w-3 rounded-full bg-danger" />
                <span className="h-3 w-3 rounded-full bg-success" />
                <span className="h-3 w-3 rounded-full bg-brand" />
              </div>
              <p className="text-sm font-semibold text-text-primary">Google Maps live ops layer</p>
              <p className="text-sm text-text-secondary">
                Placeholder surface for order density, agent routing, and kitchen markers.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[20px] border border-border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-text-primary">Alerts</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Escalations that need manual attention.
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {visibleAlerts.length ? (
              visibleAlerts.map((alert: AdminAlert) => (
                <div
                  className={cn(
                    "rounded-[18px] border p-4",
                    alert.severity === "danger"
                      ? "border-danger/20 bg-danger/5"
                      : "border-warning/20 bg-warning/5",
                  )}
                  key={alert.id}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          alert.severity === "danger" ? "text-danger" : "text-warning",
                        )}
                      >
                        {alert.title}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">
                        {alert.description}
                      </p>
                    </div>
                    <button
                      className="text-text-muted transition hover:text-text-primary"
                      onClick={() =>
                        setDismissedAlerts((current) => [...current, alert.id])
                      }
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    className="mt-4 rounded-pill border border-current px-3 py-1.5 text-xs font-semibold"
                    type="button"
                  >
                    {alert.actionLabel}
                  </button>
                </div>
              ))
            ) : (
              <div className="rounded-[18px] border border-border bg-[#FAFAFA] p-4 text-sm text-text-secondary">
                No active alerts.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="rounded-[20px] border border-border bg-white p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-text-primary">Recent orders</h2>
              <p className="mt-1 text-sm text-text-secondary">
                Sorted, paginated live operations queue.
              </p>
            </div>
          </div>
          <DataTable
            columns={columns}
            data={query.data.recentOrders}
            emptyLabel="No orders in this window."
          />
        </div>

        <div className="rounded-[20px] border border-border bg-white p-5">
          <h2 className="text-lg font-bold text-text-primary">Top restaurants today</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Ranked by completed orders and revenue.
          </p>
          <DataTable
            className="mt-5"
            columns={topRestaurantColumns}
            data={query.data.topRestaurants}
            emptyLabel="No top restaurants available."
            pageSize={5}
          />
        </div>
      </section>

      <AnimatePresence>
        {selectedOrder ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1C1C]/40 p-4"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={() => setSelectedOrder(null)}
          >
            <motion.div
              animate={{ y: 0, opacity: 1 }}
              className="w-full max-w-xl rounded-[24px] border border-border bg-white p-6 shadow-[0_24px_70px_rgba(28,28,28,0.18)]"
              exit={{ y: 12, opacity: 0 }}
              initial={{ y: 12, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                    Order detail
                  </p>
                  <h3 className="mt-2 text-2xl font-bold text-text-primary">
                    {selectedOrder.id}
                  </h3>
                </div>
                <button
                  className="rounded-full border border-border p-2 text-text-secondary"
                  onClick={() => setSelectedOrder(null)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-[18px] bg-[#FAFAFA] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-muted">Customer</p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">
                    {selectedOrder.customer}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {selectedOrder.deliveryAddress}
                  </p>
                </div>
                <div className="rounded-[18px] bg-[#FAFAFA] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-text-muted">Restaurant</p>
                  <p className="mt-2 text-sm font-semibold text-text-primary">
                    {selectedOrder.restaurant}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    ₹{selectedOrder.amount} • {selectedOrder.status}
                  </p>
                </div>
              </div>
              <div className="mt-5 rounded-[18px] border border-border p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-text-muted">Items</p>
                <div className="mt-3 space-y-2">
                  {selectedOrder.items.map((item) => (
                    <div className="text-sm text-text-primary" key={item}>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
