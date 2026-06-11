"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { toRupees, formatDate } from "@/lib/utils";
import Link from "next/link";
import toast from "react-hot-toast";
import { RefreshCw, AlertCircle } from "lucide-react";

const STATUS_OPTIONS = ["All", "SUCCESS", "PENDING", "FAILED"];
const statusStyle: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  FAILED: "bg-red-100 text-red-800",
};
const refundStatusStyle: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  FAILED: "bg-red-100 text-red-800",
};

interface RefundModalProps {
  payment: any;
  onClose: () => void;
  onSuccess: () => void;
}

function RefundModal({ payment, onClose, onSuccess }: RefundModalProps) {
  const [amount, setAmount] = useState(String(payment.amount / 100));
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRefund = async () => {
    const amountPaise = Math.round(parseFloat(amount) * 100);
    if (!amountPaise || amountPaise <= 0 || amountPaise > payment.amount) {
      toast.error(`Amount must be between ₹1 and ₹${payment.amount / 100}`);
      return;
    }
    setLoading(true);
    try {
      await api.post("/payments/refunds", {
        cfOrderId: payment.cfOrderId,
        amount: amountPaise,
        reason: reason || undefined,
      });
      toast.success("Refund initiated successfully");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.error ?? "Failed to initiate refund");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md mx-4">
        <h3 className="text-lg font-bold text-gray-900 mb-1">Initiate Refund</h3>
        <p className="text-sm text-gray-500 mb-4">
          Order <span className="font-mono">{payment.cfOrderId}</span> — Max ₹{(payment.amount / 100).toLocaleString("en-IN")}
        </p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Refund amount (₹)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              max={payment.amount / 100}
              step="0.01"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Customer complaint, wrong order, etc."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleRefund}
            disabled={loading}
            className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
          >
            {loading ? "Processing…" : "Confirm Refund"}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPaymentsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("All");
  const [activeTab, setActiveTab] = useState<"payments" | "refunds">("payments");
  const [refundModalPayment, setRefundModalPayment] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payments", statusFilter],
    queryFn: () =>
      api
        .get("/admin/payments", {
          params: statusFilter !== "All" ? { status: statusFilter } : {},
        })
        .then((r) => r.data),
  });

  const { data: refundsData, isLoading: refundsLoading, refetch: refetchRefunds } = useQuery({
    queryKey: ["admin-refunds"],
    queryFn: () => api.get("/payments/refunds").then((r) => r.data),
    enabled: activeTab === "refunds",
  });

  const payments = data?.payments ?? [];
  const refunds = refundsData?.refunds ?? [];

  const totalRevenue = payments
    .filter((p: any) => p.status === "SUCCESS")
    .reduce((sum: number, p: any) => sum + p.amount, 0);
  const failedCount = payments.filter((p: any) => p.status === "FAILED").length;
  const totalRefunded = refunds
    .filter((r: any) => r.status === "SUCCESS")
    .reduce((sum: number, r: any) => sum + r.amount, 0);

  const handleSyncRefund = async (cfRefundId: string) => {
    try {
      await api.post(`/payments/refunds/${cfRefundId}/sync`);
      toast.success("Refund status synced");
      refetchRefunds();
    } catch {
      toast.error("Sync failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Finance</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Payments & Refunds</h1>
        <p className="mt-2 text-sm text-text-secondary">All transactions and refund operations.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-[18px] border border-border bg-white p-5">
          <p className="text-sm text-text-muted">Gross revenue (shown)</p>
          <p className="mt-2 text-2xl font-bold text-text-primary">
            ₹{toRupees(totalRevenue).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-[18px] border border-border bg-white p-5">
          <p className="text-sm text-text-muted">Failed payments</p>
          <p className="mt-2 text-2xl font-bold text-danger">{failedCount}</p>
        </div>
        <div className="rounded-[18px] border border-border bg-white p-5">
          <p className="text-sm text-text-muted">Total refunded</p>
          <p className="mt-2 text-2xl font-bold text-orange-600">
            ₹{toRupees(totalRefunded).toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(["payments", "refunds"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition capitalize ${
              activeTab === tab ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "payments" && (
        <>
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
                    {["Order ID", "Customer", "Restaurant", "Amount", "Status", "Date", "Action"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-text-muted">No payments found.</td>
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
                        <td className="px-4 py-3">
                          {p.status === "SUCCESS" && (
                            <button
                              onClick={() => setRefundModalPayment(p)}
                              className="text-xs font-medium text-orange-600 hover:underline"
                            >
                              Refund
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {activeTab === "refunds" && (
        <>
          {refundsLoading ? (
            <div className="h-64 animate-pulse rounded-[20px] bg-gray-100" />
          ) : (
            <div className="rounded-[20px] border border-border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-[#FAFAFA]">
                  <tr>
                    {["Order ID", "Refund ID", "Amount", "Status", "Reason", "Date", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {refunds.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-text-muted">No refunds yet.</td>
                    </tr>
                  ) : (
                    refunds.map((r: any) => (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">{r.cfOrderId}</td>
                        <td className="px-4 py-3 font-mono text-xs text-text-secondary">{r.cfRefundId ?? "—"}</td>
                        <td className="px-4 py-3 font-semibold">₹{toRupees(r.amount).toLocaleString("en-IN")}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${refundStatusStyle[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-text-muted max-w-[180px] truncate">{r.reason ?? "—"}</td>
                        <td className="px-4 py-3 text-text-muted">{formatDate(r.createdAt)}</td>
                        <td className="px-4 py-3">
                          {r.status === "PENDING" && r.cfRefundId && (
                            <button
                              onClick={() => handleSyncRefund(r.cfRefundId)}
                              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
                            >
                              <RefreshCw className="h-3 w-3" /> Sync
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {refundModalPayment && (
        <RefundModal
          payment={refundModalPayment}
          onClose={() => setRefundModalPayment(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["admin-refunds"] });
            setActiveTab("refunds");
          }}
        />
      )}
    </div>
  );
}
