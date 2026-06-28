"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, Clock, IndianRupee } from "lucide-react";

import api from "@/lib/api";

type DueOrder = {
  settlementId: string;
  orderId: string;
  orderDate: string;
  restaurantPayable: number;
  gstCollected: number;
  adminNet: number;
};

type Dues = {
  totalPayablePaise: number;
  orderCount: number;
  orders: DueOrder[];
};

export default function RestaurantCODDuesPage() {
  const [dues, setDues] = useState<Dues | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/restaurants/mine/cod-dues")
      .then((r) => setDues(r.data))
      .catch(() => toast.error("Could not load COD dues"))
      .finally(() => setLoading(false));
  }, []);

  const rupees = (paise: number) => (paise / 100).toFixed(0);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-8 space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-100" />)}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1C1C1C]">COD Payables</h1>
        <p className="text-sm text-[#686B78] mt-1">
          For cash-on-delivery orders, the platform collects the full amount from the rider and transfers your share to you.
        </p>
      </div>

      {/* Summary card */}
      <div className={`rounded-2xl p-6 ${(dues?.totalPayablePaise ?? 0) > 0 ? "bg-orange-50 border border-orange-200" : "bg-green-50 border border-green-200"}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#686B78]">
              Platform owes you
            </p>
            <p className={`mt-1 text-4xl font-extrabold ${(dues?.totalPayablePaise ?? 0) > 0 ? "text-orange-600" : "text-green-600"}`}>
              ₹{rupees(dues?.totalPayablePaise ?? 0)}
            </p>
            <p className="text-sm text-[#686B78] mt-1">
              {dues?.orderCount ?? 0} pending order{dues?.orderCount !== 1 ? "s" : ""}
            </p>
          </div>
          {(dues?.totalPayablePaise ?? 0) > 0 ? (
            <Clock className="h-12 w-12 text-orange-300" />
          ) : (
            <CheckCircle2 className="h-12 w-12 text-green-400" />
          )}
        </div>

        {(dues?.totalPayablePaise ?? 0) > 0 && (
          <p className="mt-4 text-xs text-orange-700 bg-orange-100 rounded-xl px-3 py-2">
            Admin will transfer this amount to your registered bank account. You&apos;ll receive a notification when the payment is released.
          </p>
        )}
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 space-y-3">
        <p className="text-sm font-bold text-[#1C1C1C]">How COD settlement works</p>
        <div className="space-y-2 text-xs text-[#686B78]">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold">1</span>
            <p>Customer pays cash to the rider on delivery.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold">2</span>
            <p>Rider returns the full amount (minus their payout) to the platform.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-brand text-white text-[10px] flex items-center justify-center font-bold">3</span>
            <p>Platform transfers your share (restaurant payable) to your bank account.</p>
          </div>
        </div>
      </div>

      {/* Order breakdown */}
      {(dues?.orders.length ?? 0) > 0 && (
        <section className="rounded-2xl border border-[#E8E8E8] bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E8E8E8]">
            <p className="text-sm font-bold text-[#1C1C1C]">Pending payables by order</p>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-[#FAFAFA]">
              <tr className="text-[#686B78]">
                <th className="px-5 py-3 text-left font-medium">Order</th>
                <th className="px-5 py-3 text-right font-medium text-orange-600">Your share</th>
                <th className="px-5 py-3 text-right font-medium">GST</th>
                <th className="px-5 py-3 text-right font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0F0]">
              {dues?.orders.map((o) => (
                <tr key={o.settlementId}>
                  <td className="px-5 py-3 font-mono text-[#686B78]">#{o.orderId.slice(-6).toUpperCase()}</td>
                  <td className="px-5 py-3 text-right font-semibold text-orange-600">₹{rupees(o.restaurantPayable)}</td>
                  <td className="px-5 py-3 text-right text-[#686B78]">₹{rupees(o.gstCollected)}</td>
                  <td className="px-5 py-3 text-right text-[#686B78]">{new Date(o.orderDate).toLocaleDateString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
