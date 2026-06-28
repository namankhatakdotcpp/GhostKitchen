"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { toRupees } from "@/lib/utils";
import toast from "react-hot-toast";
import { Wallet, Store, AlertCircle, Bell, CheckCircle, Clock, ChevronDown, ChevronUp, Send } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type RiderSettlement = {
  id: string;
  orderId: string;
  orderTotal: number;
  riderPayout: number;
  riderCODDue: number;
  createdAt: string;
};

type RiderDue = {
  rider: { id: string; name: string; phone: string | null };
  totalDue: number;
  orderCount: number;
  settlements: RiderSettlement[];
};

type RestaurantSettlement = {
  id: string;
  orderId: string;
  restaurantPayable: number;
  gstCollected: number;
  adminNet: number;
  createdAt: string;
};

type RestaurantPayable = {
  restaurant: { id: string; name: string };
  totalPayable: number;
  orderCount: number;
  settlements: RestaurantSettlement[];
};

type CODSummary = {
  pending: {
    orderCount: number;
    totalRiderDue: number;
    totalRestaurantPayable: number;
    totalAdminNet: number;
    totalGST: number;
  };
  allTime: {
    orderCount: number;
    totalCashCollected: number;
    totalRestaurantPaid: number;
    totalAdminEarned: number;
    totalGSTCollected: number;
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const r = (paise: number) => toRupees(paise).toLocaleString("en-IN");

function SummaryCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <div className="rounded-[18px] border border-border bg-white p-5">
      <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold text-text-primary">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

// ── Rider Dues tab ────────────────────────────────────────────────────────────

function RiderDuesTab() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cod-rider-dues"],
    queryFn: () => api.get("/admin/cod/rider-dues").then((r) => r.data.dues as RiderDue[]),
    refetchInterval: 30_000,
  });

  const settle = useMutation({
    mutationFn: (riderId: string) => api.post(`/admin/cod/settle-rider/${riderId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cod-rider-dues"] });
      toast.success("Marked as settled");
    },
  });

  const requestPayment = useMutation({
    mutationFn: (riderId: string) => api.post(`/admin/cod/request-rider-payment/${riderId}`),
    onSuccess: () => toast.success("Payment request sent to rider"),
    onError: () => toast.error("Failed to send request"),
  });

  if (isLoading) return <div className="h-48 animate-pulse rounded-xl bg-gray-100" />;
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <CheckCircle className="h-10 w-10 text-green-500" />
        <p className="font-semibold text-text-primary">All rider dues settled</p>
        <p className="text-sm text-text-muted">No pending cash handovers from riders.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((entry) => (
        <div key={entry.rider.id} className="rounded-[18px] border border-border bg-white overflow-hidden">
          {/* Header row */}
          <div className="flex items-center gap-4 p-5">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-text-primary">{entry.rider.name}</p>
              <p className="text-xs text-text-muted mt-0.5">{entry.rider.phone ?? "—"} · {entry.orderCount} order{entry.orderCount !== 1 ? "s" : ""}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted">Cash owed to platform</p>
              <p className="text-xl font-bold text-red-600">₹{r(entry.totalDue)}</p>
            </div>
            <button
              className="ml-2 inline-flex h-10 items-center gap-1.5 rounded-full border border-brand px-3 text-xs font-semibold text-brand transition hover:bg-brand/5 disabled:opacity-50"
              disabled={requestPayment.isPending}
              onClick={() => requestPayment.mutate(entry.rider.id)}
              title="Send push notification asking rider to pay"
            >
              <Bell className="h-3.5 w-3.5" />
              Request
            </button>
            <button
              className="ml-1 inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-3 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50"
              disabled={settle.isPending}
              onClick={() => settle.mutate(entry.rider.id)}
              title="Mark as manually collected (cash in hand)"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Mark settled
            </button>
            <button
              className="ml-1 p-2 text-text-muted hover:text-text-primary"
              onClick={() => setExpanded(expanded === entry.rider.id ? null : entry.rider.id)}
            >
              {expanded === entry.rider.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {/* Expanded order list */}
          {expanded === entry.rider.id && (
            <div className="border-t border-border px-5 pb-4">
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-text-muted">
                    <th className="pb-2 text-left font-medium">Order</th>
                    <th className="pb-2 text-right font-medium">Customer paid</th>
                    <th className="pb-2 text-right font-medium">Rider keeps</th>
                    <th className="pb-2 text-right font-medium text-red-600">Rider owes</th>
                    <th className="pb-2 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entry.settlements.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 font-mono text-text-secondary">{s.orderId.slice(-8)}</td>
                      <td className="py-2 text-right">₹{r(s.orderTotal)}</td>
                      <td className="py-2 text-right text-green-700">₹{r(s.riderPayout)}</td>
                      <td className="py-2 text-right font-semibold text-red-600">₹{r(s.riderCODDue)}</td>
                      <td className="py-2 text-right text-text-muted">{new Date(s.createdAt).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Restaurant Payables tab ───────────────────────────────────────────────────

function RestaurantPayablesTab() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["cod-restaurant-payables"],
    queryFn: () => api.get("/admin/cod/restaurant-payables").then((r) => r.data.payables as RestaurantPayable[]),
    refetchInterval: 30_000,
  });

  const settle = useMutation({
    mutationFn: (restaurantId: string) => api.post(`/admin/cod/pay-restaurant/${restaurantId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cod-restaurant-payables"] });
      toast.success("Restaurant marked as paid and notified");
    },
    onError: () => toast.error("Failed to mark as paid"),
  });

  if (isLoading) return <div className="h-48 animate-pulse rounded-xl bg-gray-100" />;
  if (!data?.length) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <CheckCircle className="h-10 w-10 text-green-500" />
        <p className="font-semibold text-text-primary">All restaurant payouts done</p>
        <p className="text-sm text-text-muted">No pending bank transfers to restaurants.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((entry) => (
        <div key={entry.restaurant.id} className="rounded-[18px] border border-border bg-white overflow-hidden">
          <div className="flex items-center gap-4 p-5">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-text-primary">{entry.restaurant.name}</p>
              <p className="text-xs text-text-muted mt-0.5">{entry.orderCount} order{entry.orderCount !== 1 ? "s" : ""}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-text-muted">Platform owes restaurant</p>
              <p className="text-xl font-bold text-orange-600">₹{r(entry.totalPayable)}</p>
            </div>
            <button
              className="ml-2 inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-4 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50"
              disabled={settle.isPending}
              onClick={() => settle.mutate(entry.restaurant.id)}
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Mark paid
            </button>
            <button
              className="ml-1 p-2 text-text-muted hover:text-text-primary"
              onClick={() => setExpanded(expanded === entry.restaurant.id ? null : entry.restaurant.id)}
            >
              {expanded === entry.restaurant.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {expanded === entry.restaurant.id && (
            <div className="border-t border-border px-5 pb-4">
              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-text-muted">
                    <th className="pb-2 text-left font-medium">Order</th>
                    <th className="pb-2 text-right font-medium text-orange-600">Restaurant gets</th>
                    <th className="pb-2 text-right font-medium">GST collected</th>
                    <th className="pb-2 text-right font-medium">Platform net</th>
                    <th className="pb-2 text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {entry.settlements.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2 font-mono text-text-secondary">{s.orderId.slice(-8)}</td>
                      <td className="py-2 text-right font-semibold text-orange-600">₹{r(s.restaurantPayable)}</td>
                      <td className="py-2 text-right text-text-secondary">₹{r(s.gstCollected)}</td>
                      <td className="py-2 text-right text-green-700">₹{r(s.adminNet)}</td>
                      <td className="py-2 text-right text-text-muted">{new Date(s.createdAt).toLocaleDateString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CODSettlementsPage() {
  const [tab, setTab] = useState<"rider" | "restaurant">("rider");

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["cod-summary"],
    queryFn: () => api.get("/admin/cod/summary").then((r) => r.data as CODSummary),
    refetchInterval: 30_000,
  });

  const p = summary?.pending;
  const a = summary?.allTime;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">Finance</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">COD Settlements</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Track cash collected by riders and payouts owed to restaurants for Cash on Delivery orders.
        </p>
      </div>

      {/* Pending summary */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Pending (requires action)</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            label="Pending orders"
            value={summaryLoading ? "—" : String(p?.orderCount ?? 0)}
            sub="COD orders not yet reconciled"
            icon={Clock}
            color="text-yellow-600"
            bg="bg-yellow-50"
          />
          <SummaryCard
            label="Rider cash due"
            value={summaryLoading ? "—" : `₹${r(p?.totalRiderDue ?? 0)}`}
            sub="riders must hand over to platform"
            icon={AlertCircle}
            color="text-red-600"
            bg="bg-red-50"
          />
          <SummaryCard
            label="Restaurant payable"
            value={summaryLoading ? "—" : `₹${r(p?.totalRestaurantPayable ?? 0)}`}
            sub="platform owes restaurants"
            icon={Store}
            color="text-orange-600"
            bg="bg-orange-50"
          />
          <SummaryCard
            label="GST held"
            value={summaryLoading ? "—" : `₹${r(p?.totalGST ?? 0)}`}
            sub="pending GST for remittance"
            icon={Wallet}
            color="text-indigo-600"
            bg="bg-indigo-50"
          />
        </div>
      </div>

      {/* All-time summary */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">All-time COD totals</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            label="Total COD orders"
            value={summaryLoading ? "—" : String(a?.orderCount ?? 0)}
            icon={Wallet}
            color="text-blue-600"
            bg="bg-blue-50"
          />
          <SummaryCard
            label="Cash collected"
            value={summaryLoading ? "—" : `₹${r(a?.totalCashCollected ?? 0)}`}
            sub="total customer payments"
            icon={Wallet}
            color="text-green-600"
            bg="bg-green-50"
          />
          <SummaryCard
            label="Platform earned"
            value={summaryLoading ? "—" : `₹${r(a?.totalAdminEarned ?? 0)}`}
            sub="net admin revenue"
            icon={Wallet}
            color="text-brand"
            bg="bg-orange-50"
          />
          <SummaryCard
            label="GST collected"
            value={summaryLoading ? "—" : `₹${r(a?.totalGSTCollected ?? 0)}`}
            sub="for GST remittance"
            icon={Wallet}
            color="text-purple-600"
            bg="bg-purple-50"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-[20px] border border-border bg-white p-6">
        <div className="mb-6 flex gap-1.5">
          {[
            { key: "rider" as const, label: "Rider cash dues" },
            { key: "restaurant" as const, label: "Restaurant payouts" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full border px-5 py-2 text-xs font-semibold transition ${
                tab === t.key
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-white text-text-secondary hover:border-brand/30"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "rider" ? <RiderDuesTab /> : <RestaurantPayablesTab />}
      </div>

      {/* Finance explanation */}
      <div className="rounded-[20px] border border-border bg-white p-6">
        <h2 className="mb-4 font-semibold text-text-primary">How COD settlement works</h2>
        <div className="grid gap-4 text-sm text-text-secondary lg:grid-cols-3">
          <div className="rounded-[14px] border border-border p-4">
            <p className="font-semibold text-text-primary">1. Customer pays rider</p>
            <p className="mt-1">Customer hands the full order total in cash to the delivery rider on delivery.</p>
          </div>
          <div className="rounded-[14px] border border-border p-4">
            <p className="font-semibold text-text-primary">2. Rider hands over dues</p>
            <p className="mt-1">Rider keeps their delivery payout and hands the remainder (restaurant share + platform cut + GST) to the platform.</p>
          </div>
          <div className="rounded-[14px] border border-border p-4">
            <p className="font-semibold text-text-primary">3. Platform pays restaurant</p>
            <p className="mt-1">Platform bank-transfers the restaurant&apos;s share. Platform retains admin revenue and holds GST for quarterly remittance.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
