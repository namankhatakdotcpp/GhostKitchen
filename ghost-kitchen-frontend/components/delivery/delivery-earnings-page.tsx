"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getDeliveryEarningsData } from "@/lib/opsData";
import type { DeliveryPaymentHistoryRow } from "@/types";

const ranges = ["Today", "This week", "This month"] as const;

export function DeliveryEarningsPage() {
  const [range, setRange] = useState<(typeof ranges)[number]>("Today");

  const query = useQuery({
    queryKey: ["delivery-earnings", range],
    queryFn: () => getDeliveryEarningsData(range),
  });

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-4 py-6 pb-32">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
          Earnings
        </p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Payouts</h1>
      </div>

      <div className="mt-6 flex gap-2">
        {ranges.map((option) => (
          <button
            className={`rounded-pill border px-3 py-2 text-sm font-semibold ${
              range === option
                ? "border-brand bg-brand-light text-brand"
                : "border-border bg-white text-text-secondary"
            }`}
            key={option}
            onClick={() => setRange(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="mt-6 bone-loader h-[320px] rounded-[24px]" />
      ) : query.isError || !query.data ? (
        <div className="mt-6 rounded-[24px] border border-border bg-white p-6 text-center">
          Could not load earnings.
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-[28px] border border-border bg-white p-5 shadow-[0_18px_30px_rgba(28,28,28,0.05)]">
            <p className="text-sm text-text-secondary">Total earnings</p>
            <p className="mt-2 text-4xl font-bold text-text-primary">
              ₹{query.data.summary.totalEarnings}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-[20px] bg-[#FAFAFA] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-text-muted">Deliveries</p>
                <p className="mt-2 text-2xl font-bold text-text-primary">
                  {query.data.summary.deliveryCount}
                </p>
              </div>
              <div className="rounded-[20px] bg-[#FAFAFA] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-text-muted">Avg / delivery</p>
                <p className="mt-2 text-2xl font-bold text-text-primary">
                  ₹{query.data.summary.avgPerDelivery}
                </p>
              </div>
              <div className="rounded-[20px] bg-[#FAFAFA] p-4 col-span-2">
                <p className="text-xs uppercase tracking-[0.18em] text-text-muted">Tips</p>
                <p className="mt-2 text-2xl font-bold text-success">₹{query.data.summary.tips}</p>
              </div>
            </div>
          </div>

          <Button className="mt-5 h-16 w-full rounded-[20px] text-lg">
            Request Payout
          </Button>

          <div className="mt-6 rounded-[24px] border border-border bg-white p-4 shadow-[0_18px_30px_rgba(28,28,28,0.05)]">
            <p className="text-sm font-semibold text-text-primary">Payment history</p>
            <div className="mt-4 space-y-3">
              {query.data.history.map((row: DeliveryPaymentHistoryRow) => (
                <div
                  className="rounded-[18px] border border-border px-4 py-4"
                  key={row.id}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-text-primary">{row.orderId}</p>
                      <p className="mt-1 text-xs text-text-secondary">{row.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-text-primary">₹{row.total}</p>
                      <p className="mt-1 text-xs text-text-secondary">
                        Base ₹{row.basePay} • Tip ₹{row.tip}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
