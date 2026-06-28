"use client";

import { useEffect, useRef, useState } from "react";
import { load } from "@cashfreepayments/cashfree-js";
import { AlertCircle, CheckCircle2, CreditCard, IndianRupee } from "lucide-react";
import toast from "react-hot-toast";

import api from "@/lib/api";

type DueOrder = {
  settlementId: string;
  orderId: string;
  orderDate: string;
  customerTotal: number;
  riderPayout: number;
  riderCODDue: number;
};

type Dues = {
  totalDuePaise: number;
  orderCount: number;
  orders: DueOrder[];
};

type HistoryPayment = {
  id: string;
  cfOrderId: string;
  amountPaise: number;
  status: string;
  settledCount: number;
  createdAt: string;
};

export function DeliveryCODDuesPage() {
  const [dues, setDues] = useState<Dues | null>(null);
  const [history, setHistory] = useState<HistoryPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const cashfreeRef = useRef<any>(null);

  useEffect(() => {
    Promise.all([
      api.get("/delivery/cod/dues"),
      api.get("/delivery/cod/payment-history"),
    ])
      .then(([duesRes, histRes]) => {
        setDues(duesRes.data);
        setHistory(histRes.data.payments ?? []);
      })
      .catch(() => toast.error("Could not load COD dues"))
      .finally(() => setLoading(false));
  }, []);

  // After returning from Cashfree, check the URL for our ref and auto-verify
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    const status = params.get("status");
    if (ref && status === "done") {
      api
        .post("/delivery/cod/verify-payment", { cfOrderId: ref })
        .then((r) => {
          if (r.data.status === "SUCCESS") {
            toast.success("Payment verified! Dues cleared.");
            window.location.href = "/delivery/cod-dues";
          } else {
            toast.error("Payment could not be verified yet. Please try again in a moment.");
          }
        })
        .catch(() => toast.error("Verification failed"));
    }
  }, []);

  async function handlePayNow() {
    setPaying(true);
    try {
      const res = await api.post("/delivery/cod/initiate-payment");
      const { paymentSessionId } = res.data;

      if (!cashfreeRef.current) {
        cashfreeRef.current = await load({ mode: process.env.NEXT_PUBLIC_CASHFREE_ENV === "PRODUCTION" ? "production" : "sandbox" });
      }
      const cf = cashfreeRef.current;
      const checkoutOptions = {
        paymentSessionId,
        redirectTarget: "_self",
      };
      cf.checkout(checkoutOptions);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Could not initiate payment";
      toast.error(msg);
      setPaying(false);
    }
  }

  const rupees = (paise: number) => (paise / 100).toFixed(0);

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-8 space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-text-primary">COD Settlement</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          Cash you collected from customers must be returned to the platform.
        </p>
      </div>

      {/* Summary card */}
      <div className={`rounded-2xl p-5 ${(dues?.totalDuePaise ?? 0) > 0 ? "bg-orange-50 border border-orange-200" : "bg-green-50 border border-green-200"}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">
              Total due to platform
            </p>
            <p className={`mt-1 text-3xl font-extrabold ${(dues?.totalDuePaise ?? 0) > 0 ? "text-orange-600" : "text-green-600"}`}>
              ₹{rupees(dues?.totalDuePaise ?? 0)}
            </p>
            <p className="text-xs text-text-secondary mt-1">
              {dues?.orderCount ?? 0} unsettled order{dues?.orderCount !== 1 ? "s" : ""}
            </p>
          </div>
          {(dues?.totalDuePaise ?? 0) > 0 ? (
            <AlertCircle className="h-10 w-10 text-orange-400" />
          ) : (
            <CheckCircle2 className="h-10 w-10 text-green-400" />
          )}
        </div>

        {(dues?.totalDuePaise ?? 0) > 0 && (
          <button
            onClick={handlePayNow}
            disabled={paying}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-bold text-white hover:bg-brand/90 disabled:bg-gray-300 transition"
          >
            <CreditCard className="h-4 w-4" />
            {paying ? "Opening payment…" : `Pay ₹${rupees(dues?.totalDuePaise ?? 0)} now`}
          </button>
        )}
      </div>

      {/* Breakdown explanation */}
      <div className="rounded-2xl border border-border bg-white p-4 space-y-2">
        <p className="text-xs font-semibold text-text-primary">How COD settlement works</p>
        <p className="text-xs text-text-secondary leading-relaxed">
          On a cash order you collect the full amount from the customer. You keep your delivery payout (₹ earned). The rest — restaurant&apos;s share + platform fee + GST — must be returned to the platform via the Pay button above.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl border border-border bg-surface p-1">
        {(["pending", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${tab === t ? "bg-white shadow-sm text-text-primary" : "text-text-secondary"}`}
          >
            {t === "pending" ? "Pending orders" : "Payment history"}
          </button>
        ))}
      </div>

      {tab === "pending" ? (
        dues?.orders.length === 0 ? (
          <p className="text-center text-sm text-text-secondary py-8">No pending COD dues 🎉</p>
        ) : (
          <div className="space-y-2">
            {dues?.orders.map((o) => (
              <div key={o.settlementId} className="rounded-2xl border border-border bg-white p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-text-primary">#{o.orderId.slice(-6).toUpperCase()}</p>
                  <p className="text-xs text-text-muted">{new Date(o.orderDate).toLocaleDateString("en-IN")}</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">Collected</p>
                    <p className="text-sm font-bold text-text-primary">₹{rupees(o.customerTotal)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">Your payout</p>
                    <p className="text-sm font-bold text-green-600">₹{rupees(o.riderPayout)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">Due to platform</p>
                    <p className="text-sm font-bold text-orange-600">₹{rupees(o.riderCODDue)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        history.length === 0 ? (
          <p className="text-center text-sm text-text-secondary py-8">No payment history yet</p>
        ) : (
          <div className="space-y-2">
            {history.map((p) => (
              <div key={p.id} className="rounded-2xl border border-border bg-white p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">₹{rupees(p.amountPaise)}</p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {new Date(p.createdAt).toLocaleDateString("en-IN")} · {p.settledCount} order{p.settledCount !== 1 ? "s" : ""} cleared
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.status === "SUCCESS" ? "bg-green-100 text-green-700" : p.status === "PENDING" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
