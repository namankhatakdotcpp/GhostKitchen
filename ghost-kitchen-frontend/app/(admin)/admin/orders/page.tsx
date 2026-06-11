"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { api } from "@/lib/api";
import { formatDate, toRupees } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";

const ALL_STATUSES = ["All", "PLACED", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];

const statusStyle: Record<string, string> = {
  PLACED: "bg-blue-100 text-blue-800",
  CONFIRMED: "bg-indigo-100 text-indigo-800",
  PREPARING: "bg-yellow-100 text-yellow-800",
  OUT_FOR_DELIVERY: "bg-orange-100 text-orange-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const NEXT_STATUS: Record<string, string> = {
  PLACED: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};

export default function AdminOrdersPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: () => api.get("/admin/orders").then((r) => r.data?.data ?? []),
    refetchInterval: 30_000,
  });

  const orders: any[] = useMemo(() => {
    const all = data ?? [];
    const q = search.toLowerCase();
    return all.filter((o: any) => {
      const matchStatus = statusFilter === "All" || o.status === statusFilter;
      const matchSearch = !q
        || o.id?.toLowerCase().includes(q)
        || o.customer?.name?.toLowerCase().includes(q)
        || o.restaurant?.name?.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [data, statusFilter, search]);

  const stats = useMemo(() => {
    const all = data ?? [];
    return {
      total: all.length,
      active: all.filter((o: any) => !["DELIVERED", "CANCELLED"].includes(o.status)).length,
      delivered: all.filter((o: any) => o.status === "DELIVERED").length,
      revenue: all.filter((o: any) => o.status === "DELIVERED").reduce((s: number, o: any) => s + Number(o.total), 0),
    };
  }, [data]);

  const handleAdvanceStatus = async (order: any) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setUpdatingId(order.id);
    try {
      await api.patch(`/admin/orders/${order.id}/status`, { status: next });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success(`Order → ${next}`);
    } catch {
      toast.error("Status update failed");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!confirm("Cancel this order?")) return;
    setUpdatingId(orderId);
    try {
      await api.patch(`/admin/orders/${orderId}/cancel`, { reason: "Cancelled by admin" });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("Order cancelled");
    } catch {
      toast.error("Cancel failed");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Operations</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Orders</h1>
        <p className="mt-2 text-sm text-text-secondary">Live order queue — auto-refreshes every 30 seconds.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total orders", value: stats.total },
          { label: "Active now", value: stats.active, highlight: true },
          { label: "Delivered today", value: stats.delivered },
          { label: "Revenue (delivered)", value: `₹${toRupees(stats.revenue).toLocaleString("en-IN")}` },
        ].map((s) => (
          <div key={s.label} className="rounded-[18px] border border-border bg-white p-5">
            <p className="text-sm text-text-muted">{s.label}</p>
            <p className={`mt-2 text-2xl font-bold ${s.highlight ? "text-brand" : "text-text-primary"}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order ID, customer, restaurant…"
          className="w-64 rounded-xl border border-border bg-white px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <div className="flex gap-1.5 overflow-x-auto">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                statusFilter === s
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-white text-text-secondary hover:border-brand/30"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-[20px] bg-gray-100" />
      ) : (
        <div className="rounded-[20px] border border-border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-[#FAFAFA]">
              <tr>
                {["Order", "Customer", "Restaurant", "Items", "Total", "Status", "Placed", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-text-muted">No orders found.</td>
                </tr>
              ) : (
                orders.map((o: any) => (
                  <tr key={o.id} className="border-b border-border last:border-0 hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3">
                      <Link href={`/order/${o.id}/track`} className="font-mono text-xs text-brand hover:underline">
                        {o.id.slice(0, 10)}…
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm">{o.customer?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-sm">{o.restaurant?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {Array.isArray(o.items) ? `${o.items.length} item${o.items.length !== 1 ? "s" : ""}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold">₹{toRupees(o.total).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusStyle[o.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">{formatDate(o.placedAt ?? o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {NEXT_STATUS[o.status] && (
                          <button
                            onClick={() => handleAdvanceStatus(o)}
                            disabled={updatingId === o.id}
                            className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
                          >
                            → {NEXT_STATUS[o.status]}
                          </button>
                        )}
                        {!["DELIVERED", "CANCELLED"].includes(o.status) && (
                          <button
                            onClick={() => handleCancel(o.id)}
                            disabled={updatingId === o.id}
                            className="rounded-lg border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
