"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { toRupees, formatDate } from "@/lib/utils";
import Link from "next/link";

const STATUS_OPTIONS = ["All", "SUCCESS", "PENDING", "FAILED"];
const statusStyle: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  FAILED: "bg-red-100 text-red-800",
};

export default function AdminPaymentsPage() {
  const [statusFilter, setStatusFilter] = useState("All");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payments", statusFilter],
    queryFn: () =>
      api
        .get("/admin/payments", {
          params: statusFilter !== "All" ? { status: statusFilter } : {},
        })
        .then((r) => r.data),
  });

  const payments = data?.payments ?? [];

  // Summary stats
  const totalRevenue = payments
    .filter((p: any) => p.status === "SUCCESS")
    .reduce((sum: number, p: any) => sum + p.amount, 0);
  const failedCount = payments.filter((p: any) => p.status === "FAILED").length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Finance</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Payments</h1>
        <p className="mt-2 text-sm text-text-secondary">All transactions across the platform.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[18px] border border-border bg-white p-5">
          <p className="text-sm text-text-muted">Total revenue (shown)</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            ₹{toRupees(totalRevenue).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-[18px] border border-border bg-white p-5">
          <p className="text-sm text-text-muted">Total transactions</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">{payments.length}</p>
        </div>
        <div className="rounded-[18px] border border-border bg-white p-5">
          <p className="text-sm text-text-muted">Failed payments</p>
          <p className="mt-2 text-2xl font-bold text-danger">{failedCount}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              statusFilter === s
                ? "border-brand bg-brand-light text-brand"
                : "border-border text-text-secondary"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-[20px] bg-gray-100" />
      ) : (
        <div className="rounded-[20px] border border-border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-[#FAFAFA]">
              <tr>
                {["Order ID", "Customer", "Restaurant", "Amount", "Status", "Date"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-text-muted">No payments found.</td>
                </tr>
              ) : (
                payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-border last:border-0 hover:bg-[#FAFAFA]">
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                      {p.orderId ? (
                        <Link href={`/order/${p.orderId}/track`} className="text-brand hover:underline">
                          {p.cfOrderId}
                        </Link>
                      ) : p.cfOrderId}
                    </td>
                    <td className="px-4 py-3">{p.customerName ?? "—"}</td>
                    <td className="px-4 py-3">{p.restaurantName ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold">₹{toRupees(p.amount).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-muted">{formatDate(p.createdAt)}</td>
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
