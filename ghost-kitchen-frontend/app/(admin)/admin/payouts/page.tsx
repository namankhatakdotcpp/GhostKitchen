"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { toRupees } from "@/lib/utils";
import { DollarSign, AlertCircle, CheckCircle, Clock } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  FAILED: "bg-red-100 text-red-800",
};

export default function AdminPayoutsPage() {
  const [status, setStatus] = useState("All");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payments", status, page],
    queryFn: () =>
      api
        .get("/admin/payments", {
          params: { status: status === "All" ? undefined : status, page, limit: 20 },
        })
        .then((r) => r.data),
  });

  const payments: any[] = data?.payments ?? [];
  const total: number = data?.total ?? 0;

  const successTotal = payments
    .filter((p) => p.status === "SUCCESS")
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const pendingTotal = payments
    .filter((p) => p.status === "PENDING")
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const failedCount = payments.filter((p) => p.status === "FAILED").length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Finance</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Payouts</h1>
        <p className="mt-2 text-sm text-text-secondary">Payment records and settlement overview.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Settled (this page)", value: `₹${toRupees(successTotal).toLocaleString("en-IN")}`, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
          { label: "Pending (this page)", value: `₹${toRupees(pendingTotal).toLocaleString("en-IN")}`, icon: Clock, color: "text-yellow-600", bg: "bg-yellow-50" },
          { label: "Failed (this page)", value: failedCount, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
        ].map((s) => (
          <div key={s.label} className="rounded-[18px] border border-border bg-white p-5">
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${s.bg}`}>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <p className="text-sm text-text-muted">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-text-primary">{isLoading ? "—" : s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {["All", "SUCCESS", "PENDING", "FAILED"].map((s) => (
          <button
            key={s}
            onClick={() => { setStatus(s); setPage(1); }}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
              status === s
                ? "border-brand bg-brand text-white"
                : "border-border bg-white text-text-secondary hover:border-brand/30"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-[20px] bg-gray-100" />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-[#FAFAFA]">
              <tr>
                {["CF Order ID", "Customer", "Restaurant", "Amount", "Status", "Order ID", "Date"].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-text-muted">
                    No payments found.
                  </td>
                </tr>
              ) : (
                payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">{p.cfOrderId}</td>
                    <td className="px-4 py-3">{p.customerName ?? "—"}</td>
                    <td className="px-4 py-3">{p.restaurantName ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold">
                      ₹{toRupees(Number(p.amount)).toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                          STATUS_STYLE[p.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-muted">
                      {p.orderId ? p.orderId.slice(0, 10) + "…" : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-text-muted">
                      {new Date(p.createdAt).toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {total > 20 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-muted">
            Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 hover:border-brand/30"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 20 >= total}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 hover:border-brand/30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
