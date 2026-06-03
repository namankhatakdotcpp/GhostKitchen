"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import api from "@/lib/api";

type Period = "today" | "week" | "month";

const TABS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
];

export function DeliveryEarningsPage() {
  const [period, setPeriod] = useState<Period>("today");

  const query = useQuery({
    queryKey: ["delivery-earnings", period],
    queryFn: () => api.get(`/delivery/earnings?period=${period}`).then(r => r.data),
  });

  const d = query.data;

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6 pb-32">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Earnings</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Your earnings</h1>
      </div>

      <div className="mt-5 flex gap-2">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setPeriod(t.id)}
            className={`rounded-pill border px-4 py-2 text-sm font-semibold transition ${period === t.id ? "border-brand bg-brand-light text-brand" : "border-border bg-white text-text-secondary"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 animate-pulse rounded-[22px] bg-gray-100" />)}
        </div>
      ) : (
        <>
          {/* Hero */}
          <div className="mt-6 rounded-[28px] border border-border bg-white p-6 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
            <p className="text-sm text-text-secondary">Total earned</p>
            <p className="mt-1 text-5xl font-bold text-text-primary">₹{d?.total ?? 0}</p>
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-5">
              <div>
                <p className="text-xl font-bold text-text-primary">{d?.deliveries ?? 0}</p>
                <p className="text-xs text-text-secondary">Deliveries</p>
              </div>
              <div className="border-x border-border text-center">
                <p className="text-xl font-bold text-text-primary">₹{d?.avgPerDelivery ?? 0}</p>
                <p className="text-xs text-text-secondary">Avg / trip</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-text-primary">0h</p>
                <p className="text-xs text-text-secondary">Online</p>
              </div>
            </div>
          </div>

          {/* Bar chart */}
          {(d?.dailyBreakdown?.length ?? 0) > 0 && (
            <div className="mt-5 rounded-[28px] border border-border bg-white p-5 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
              <p className="mb-4 text-sm font-semibold text-text-primary">Daily breakdown</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={d.dailyBreakdown} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v: number) => [`₹${v}`, "Earnings"]}
                    contentStyle={{ borderRadius: "12px", border: "1px solid #E8E8E8", fontSize: "12px" }}
                  />
                  <Bar dataKey="earnings" fill="#FF5200" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* History */}
          {(d?.recentOrders?.length ?? 0) > 0 && (
            <div className="mt-5 overflow-hidden rounded-[28px] border border-border bg-white shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
              <div className="border-b border-border px-5 py-4">
                <p className="text-sm font-semibold text-text-primary">Recent deliveries</p>
              </div>
              {d.recentOrders.map((row: any) => (
                <div key={row.id} className="flex items-center justify-between border-b border-border px-5 py-4 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-text-primary">#{row.orderId.slice(-6).toUpperCase()}</p>
                    <p className="text-xs text-text-secondary">
                      {row.date ? new Date(row.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-text-primary">₹{row.total}</p>
                    <p className="text-xs text-text-secondary">Base ₹{row.basePay}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Payout */}
          <div className="mt-5 rounded-[28px] border border-border bg-white p-5 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
            <p className="text-sm font-semibold text-text-primary">Payout</p>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-text-primary">₹{d?.total ?? 0}</p>
                <p className="text-xs text-text-secondary">Available to withdraw</p>
              </div>
              <button
                disabled={(d?.total ?? 0) < 200}
                className="rounded-xl bg-brand px-5 py-3 text-sm font-bold text-white disabled:bg-gray-200 disabled:text-gray-400 transition"
                type="button">
                Request payout
              </button>
            </div>
            {(d?.total ?? 0) < 200 && (
              <p className="mt-2 text-xs text-text-muted">Minimum ₹200 required to request a payout</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
