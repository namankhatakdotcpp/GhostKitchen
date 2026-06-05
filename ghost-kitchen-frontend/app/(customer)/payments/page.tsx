"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toRupees, formatDate } from "@/lib/utils";
import Link from "next/link";

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

const statusStyle: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  FAILED: "bg-red-100 text-red-800",
};

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/payments/history")
      .then((r) => setPayments(r.data.payments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4">
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
          ))}
        </div>
      )}
    </div>
  );
}
