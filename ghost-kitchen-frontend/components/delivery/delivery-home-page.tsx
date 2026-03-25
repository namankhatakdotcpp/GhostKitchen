"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronRight, Power, Wallet } from "lucide-react";

import { getDeliveryEarningsData } from "@/lib/opsData";
import { useDeliveryStore } from "@/store/deliveryStore";

export function DeliveryHomePage() {
  const { isOnline, setOnline } = useDeliveryStore();

  const earningsQuery = useQuery({
    queryKey: ["delivery-earnings", "Today"],
    queryFn: () => getDeliveryEarningsData("Today"),
  });

  function toggleOnline() {
    setOnline(!isOnline);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
          Delivery partner
        </p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Home</h1>
      </div>

      <div className="mt-6 rounded-[28px] border border-border bg-white p-5 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-light text-brand">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-text-secondary">Today&apos;s earnings</p>
            <p className="mt-1 text-3xl font-bold text-text-primary">
              ₹{earningsQuery.data?.summary.totalEarnings ?? "--"}
            </p>
          </div>
        </div>
      </div>

      <motion.button
        animate={isOnline ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        className={`mt-8 flex h-24 w-full items-center justify-center gap-3 rounded-[999px] text-xl font-bold text-white shadow-[0_18px_40px_rgba(28,28,28,0.12)] ${
          isOnline ? "bg-success" : "bg-danger"
        }`}
        onClick={toggleOnline}
        transition={{ duration: 0.22 }}
        type="button"
      >
        <Power className="h-6 w-6" />
        {isOnline ? "Go Offline" : "Go Online"}
      </motion.button>

      <div className="mt-8 rounded-[28px] border border-border bg-white p-5 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
          Status
        </p>
        <h2 className="mt-3 text-2xl font-bold text-text-primary">
          {isOnline ? "Waiting for orders..." : "You are offline"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {isOnline
            ? "Stay ready. A full-screen assignment card will appear the moment an order is assigned."
            : "Go online to start receiving delivery requests."}
        </p>
      </div>

      <div className="mt-auto rounded-[24px] border border-border bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">Quick tip</p>
            <p className="mt-1 text-sm text-text-secondary">
              Keep battery saver off for smoother location updates.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-text-muted" />
        </div>
      </div>
    </div>
  );
}
