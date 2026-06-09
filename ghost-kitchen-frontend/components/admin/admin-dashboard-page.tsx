"use client";

import { useQuery } from "@tanstack/react-query";
import { type ColumnDef } from "@tanstack/react-table";
import { AnimatePresence, motion } from "framer-motion";
import { Bike, ShoppingBag, Store, TrendingUp, Wallet, X } from "lucide-react";
import { useMemo, useState } from "react";

import { DataTable } from "@/components/ui/data-table";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import type { AdminAlert, AdminMetric, AdminOrderRow } from "@/types";

const metricIconMap = { ShoppingBag, Wallet, Store, Bike } as const;

const statusStyles: Record<string, string> = {
  PLACED:            "bg-[#EEF4FF] text-[#2E6BFF]",
  CONFIRMED:         "bg-brand-light text-brand",
  PREPARING:         "bg-[#FFF5E5] text-warning",
  OUT_FOR_DELIVERY:  "bg-[#F3EEFF] text-[#7C4DFF]",
  DELIVERING:        "bg-[#F3EEFF] text-[#7C4DFF]",
  DELIVERED:         "bg-success/10 text-success",
  CANCELLED:         "bg-danger/10 text-danger",
};

async function fetchDashboard() {
  const { data } = await api.get("/admin/stats");
  const s = data.data;

  const metrics: AdminMetric[] = [
    { id: "orders",      label: "Orders Today",         value: String(s.ordersToday),        change: "", trend: "up",   icon: "ShoppingBag" },
    { id: "revenue",     label: "Revenue Today",         value: `₹${Number(s.revenueToday).toLocaleString("en-IN")}`, change: "", trend: "up", icon: "Wallet" },
    { id: "restaurants", label: "Active Restaurants",    value: String(s.activeRestaurants),  change: "", trend: "flat", icon: "Store" },
    { id: "agents",      label: "Available Agents",      value: String(s.availableAgents),    change: "", trend: "flat", icon: "Bike" },
  ];

  const alerts: AdminAlert[] = s.pendingOrders > 0 ? [{
    id: "pending",
    title: `${s.pendingOrders} unconfirmed order${s.pendingOrders > 1 ? "s" : ""}`,
    description: "Orders placed over 15 minutes ago with no restaurant confirmation.",
    severity: "danger",
    actionLabel: "View orders",
  }] : [];

  const recentOrders: AdminOrderRow[] = (s.recentOrders ?? []).map((o: any) => ({
    id: o.id,
    customer: o.customerName,
    restaurant: o.restaurantName,
    amount: Number(o.total) / 100,
    status: o.status,
    time: new Date(o.placedAt ?? o.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    placedAt: o.placedAt ?? o.createdAt,
    items: [],
    deliveryAddress: "",
  }));

  return { metrics, alerts, recentOrders, topRestaurants: [] };
}

function MetricCard({ metric }: { metric: AdminMetric }) {
  const Icon = metricIconMap[metric.icon as keyof typeof metricIconMap] ?? TrendingUp;
  return (
    <div className="group rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm transition hover:shadow-md hover:-translate-y-0.5">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF3EE] text-[#FF5200]">
          <Icon className="h-5 w-5" />
        </div>
        <TrendingUp className="h-4 w-4 text-[#D1D5DB] group-hover:text-[#FF5200] transition" />
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#9CA3AF]">{metric.label}</p>
      <p className="mt-1.5 text-3xl font-bold tracking-tight text-[#111827]">{metric.value}</p>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function AdminDashboardPage() {
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderRow | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const authUser = useAuthStore((s) => s.user);
  const firstName = authUser?.name?.split(" ")[0] ?? "Admin";

  const query = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: 30000,
  });

  const columns = useMemo<ColumnDef<AdminOrderRow>[]>(() => [
    {
      accessorKey: "id",
      header: "Order ID",
      cell: ({ row }) => <span className="font-mono text-xs text-text-secondary">{row.original.id.slice(-8).toUpperCase()}</span>,
    },
    { accessorKey: "customer",   header: "Customer" },
    { accessorKey: "restaurant", header: "Restaurant" },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => <span className="font-semibold">₹{row.original.amount.toLocaleString("en-IN")}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", statusStyles[row.original.status] ?? "bg-gray-100 text-gray-600")}>
          {row.original.status}
        </span>
      ),
    },
    { accessorKey: "time", header: "Time" },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <button className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold" onClick={() => setSelectedOrder(row.original)} type="button">
          View
        </button>
      ),
    },
  ], []);

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div className="bone-loader h-36 rounded-[18px]" key={i} />)}
        </div>
        <div className="bone-loader h-[360px] rounded-[20px]" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-[20px] border border-border bg-white p-8 text-center">
        <h1 className="text-2xl font-bold text-text-primary">Dashboard unavailable</h1>
        <button className="mt-5 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white" onClick={() => query.refetch()} type="button">Retry</button>
      </div>
    );
  }

  const visibleAlerts = query.data.alerts.filter((a) => !dismissedAlerts.includes(a.id));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9CA3AF]">{getGreeting()}</p>
          <h1 className="mt-1 text-3xl font-bold text-[#111827]">{firstName}</h1>
          <p className="mt-1.5 text-sm text-[#6B7280]">
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm text-[#6B7280] shadow-sm">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="font-medium text-[#111827]">All systems operational</span>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-4">
        {query.data.metrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
      </section>

      {visibleAlerts.length > 0 && (
        <section className="space-y-3">
          {visibleAlerts.map((alert) => (
            <div key={alert.id} className={cn("rounded-[18px] border p-4 flex items-start justify-between gap-4",
              alert.severity === "danger" ? "border-danger/20 bg-danger/5" : "border-warning/20 bg-warning/5")}>
              <div>
                <p className={cn("text-sm font-semibold", alert.severity === "danger" ? "text-danger" : "text-warning")}>{alert.title}</p>
                <p className="mt-1 text-sm text-text-secondary">{alert.description}</p>
              </div>
              <button onClick={() => setDismissedAlerts((p) => [...p, alert.id])} type="button" className="text-text-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-[20px] border border-border bg-white p-5">
        <h2 className="text-lg font-bold text-text-primary mb-5">Recent orders</h2>
        <DataTable columns={columns} data={query.data.recentOrders} emptyLabel="No orders yet." />
      </section>

      <AnimatePresence>
        {selectedOrder && (
          <motion.div animate={{ opacity: 1 }} className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1C1C]/40 p-4" exit={{ opacity: 0 }} initial={{ opacity: 0 }} onClick={() => setSelectedOrder(null)}>
            <motion.div animate={{ y: 0, opacity: 1 }} className="w-full max-w-md rounded-[24px] border border-border bg-white p-6" exit={{ y: 12, opacity: 0 }} initial={{ y: 12, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Order</p>
                  <h3 className="mt-1 text-xl font-bold text-text-primary">{selectedOrder.id.slice(-8).toUpperCase()}</h3>
                </div>
                <button className="rounded-full border border-border p-2" onClick={() => setSelectedOrder(null)} type="button"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-[14px] bg-[#FAFAFA] p-3">
                  <p className="text-xs text-text-muted">Customer</p>
                  <p className="mt-1 text-sm font-semibold">{selectedOrder.customer}</p>
                </div>
                <div className="rounded-[14px] bg-[#FAFAFA] p-3">
                  <p className="text-xs text-text-muted">Restaurant</p>
                  <p className="mt-1 text-sm font-semibold">{selectedOrder.restaurant}</p>
                </div>
                <div className="rounded-[14px] bg-[#FAFAFA] p-3">
                  <p className="text-xs text-text-muted">Amount</p>
                  <p className="mt-1 text-sm font-semibold">₹{selectedOrder.amount}</p>
                </div>
                <div className="rounded-[14px] bg-[#FAFAFA] p-3">
                  <p className="text-xs text-text-muted">Status</p>
                  <span className={cn("mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold", statusStyles[selectedOrder.status] ?? "bg-gray-100")}>{selectedOrder.status}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
