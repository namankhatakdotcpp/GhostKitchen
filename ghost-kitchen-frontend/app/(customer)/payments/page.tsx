"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toRupees, formatDate } from "@/lib/utils";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import toast from "react-hot-toast";

interface PaymentRecord {
  id: string;
  cfOrderId: string;
  amount: number;
  status: string;
  createdAt: string;
  orderId: string | null;
  restaurantName: string | null;
  items: Array<{ name: string; quantity: number }>;
}

interface RefundRecord {
  id: string;
  cfOrderId: string;
  cfRefundId: string | null;
  amount: number;
  status: string;
  reason: string | null;
  createdAt: string;
}

const statusStyle: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  FAILED: "bg-red-100 text-red-800",
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [refundMap, setRefundMap] = useState<Map<string, RefundRecord[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get("/payments/history").then((r) => r.data.payments ?? []),
      api.get("/payments/my-refunds").then((r) => r.data.refunds ?? []).catch(() => []),
    ]).then(([pays, refs]: [PaymentRecord[], RefundRecord[]]) => {
      setPayments(pays);
      const map = new Map<string, RefundRecord[]>();
      for (const ref of refs) {
        if (!map.has(ref.cfOrderId)) map.set(ref.cfOrderId, []);
        map.get(ref.cfOrderId)!.push(ref);
      }
      setRefundMap(map);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSyncRefund = async (cfRefundId: string, cfOrderId: string) => {
    setSyncingId(cfRefundId);
    try {
      const res = await api.post(`/payments/my-refunds/${cfRefundId}/sync`);
      const updated: RefundRecord = res.data.refund;
      setRefundMap((prev) => {
        const next = new Map(prev);
        const list = (next.get(cfOrderId) ?? []).map((r) => (r.id === updated.id ? updated : r));
        next.set(cfOrderId, list);
        return next;
      });
      toast.success("Refund status updated");
    } catch {
      toast.error("Could not sync refund status");
    } finally {
      setSyncingId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Payment History</h1>

      {payments.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No payments yet.</div>
      ) : (
        <div className="space-y-4">
          {payments.map((p) => {
            const orderRefunds = refundMap.get(p.cfOrderId) ?? [];
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {p.restaurantName ?? "Unknown restaurant"}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{formatDate(p.createdAt)}</p>
                      {Array.isArray(p.items) && p.items.length > 0 && (
                        <p className="text-xs text-gray-600 mt-1 line-clamp-1">
                          {p.items.map((item: any) => `${item.name} ×${item.quantity}`).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900">₹{toRupees(p.amount).toLocaleString("en-IN")}</p>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyle[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                  {p.orderId && (
                    <div className="mt-3 border-t border-gray-100 pt-2">
                      <Link
                        href={`/order/${p.orderId}/track`}
                        className="text-xs font-semibold text-orange-600 hover:underline"
                      >
                        View order →
                      </Link>
                    </div>
                  )}
                </div>

                {orderRefunds.length > 0 && (
                  <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Refund</p>
                    {orderRefunds.map((ref) => (
                      <div key={ref.id} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${statusStyle[ref.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {ref.status}
                          </span>
                          <span className="text-sm font-semibold text-gray-800">
                            ₹{toRupees(ref.amount).toLocaleString("en-IN")}
                          </span>
                          {ref.reason && (
                            <span className="text-xs text-gray-500">— {ref.reason}</span>
                          )}
                        </div>
                        {ref.status === "PENDING" && ref.cfRefundId && (
                          <button
                            onClick={() => handleSyncRefund(ref.cfRefundId!, p.cfOrderId)}
                            disabled={syncingId === ref.cfRefundId}
                            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
                          >
                            <RefreshCw className={`h-3 w-3 ${syncingId === ref.cfRefundId ? "animate-spin" : ""}`} />
                            Refresh
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
