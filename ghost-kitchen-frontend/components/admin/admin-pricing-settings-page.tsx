"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { api } from "@/lib/api";
import { toPaise, toRupees } from "@/lib/utils";

interface PlatformSettings {
  deliveryBaseFee: number; // paise
  deliveryPerKmFee: number; // paise
  platformFeeMode: "FLAT" | "PERCENT";
  platformFeeValue: number; // paise if FLAT, raw percent if PERCENT
  splitRestaurantPct: number;
  splitRiderPct: number;
  splitAdminPct: number;
}

async function fetchPricingSettings(): Promise<PlatformSettings> {
  const { data } = await api.get("/admin/pricing-settings");
  return data.settings;
}

async function savePricingSettings(body: Partial<PlatformSettings>) {
  const { data } = await api.patch("/admin/pricing-settings", body);
  return data.settings as PlatformSettings;
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-[#F3F4F6] py-4 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#111827]">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-[#6B7280]">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function NumInput({
  value, onChange, suffix, min = 0, max, step = 0.01, width = "w-28",
}: {
  value: number; onChange: (v: number) => void; suffix?: string; min?: number; max?: number; step?: number; width?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`${width} rounded-xl border border-[#E5E7EB] px-3 py-2 text-right text-sm focus:border-[#FF5200] focus:outline-none`}
      />
      {suffix && <span className="text-xs font-semibold text-[#6B7280]">{suffix}</span>}
    </div>
  );
}

export function AdminPricingSettingsPage() {
  const qc = useQueryClient();

  const { data: remote, isLoading } = useQuery({
    queryKey: ["admin-pricing-settings"],
    queryFn: fetchPricingSettings,
  });

  const [local, setLocal] = useState<PlatformSettings | null>(null);
  useEffect(() => {
    if (remote) setLocal(remote);
  }, [remote]);

  const mutation = useMutation({
    mutationFn: savePricingSettings,
    onSuccess: (saved) => {
      qc.setQueryData(["admin-pricing-settings"], saved);
      setLocal(saved);
      toast.success("Pricing settings saved", { icon: "✓" });
    },
    onError: (e: any) => toast.error(e.error ?? "Failed to save pricing settings — check the values and try again"),
  });

  if (isLoading || !local) {
    return <div className="p-8 text-sm text-[#6B7280]">Loading pricing settings…</div>;
  }

  const splitSum = local.splitRestaurantPct + local.splitRiderPct + local.splitAdminPct;
  const splitValid = Math.abs(splitSum - 100) < 0.01;

  function set<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) {
    setLocal((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function save() {
    if (!local) return;
    if (!splitValid) {
      toast.error("Restaurant % + Rider % + Admin % must sum to 100 before saving");
      return;
    }
    mutation.mutate(local);
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold text-[#111827]">Pricing &amp; Commission</h1>
      <p className="mt-1 text-sm text-[#6B7280]">
        Controls how every order&apos;s delivery fee, platform fee, and the 3-way revenue split are
        calculated. Changes only apply to orders placed after saving — past orders keep whatever
        was in effect when they were placed.
      </p>

      <section className="mt-6 rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#6B7280]">Delivery fee</h2>
        <div className="mt-2">
          <FieldRow label="Base fee" hint="Charged on every order, regardless of distance">
            <NumInput
              value={toRupees(local.deliveryBaseFee)}
              onChange={(v) => set("deliveryBaseFee", toPaise(v))}
              suffix="₹"
            />
          </FieldRow>
          <FieldRow label="Per-km rate" hint="Added on top of the base fee, × restaurant-to-customer distance">
            <NumInput
              value={toRupees(local.deliveryPerKmFee)}
              onChange={(v) => set("deliveryPerKmFee", toPaise(v))}
              suffix="₹/km"
            />
          </FieldRow>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#6B7280]">Platform fee</h2>
        <div className="mt-2">
          <FieldRow label="Mode">
            <div className="flex gap-2">
              {(["FLAT", "PERCENT"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set("platformFeeMode", mode)}
                  className={`rounded-xl px-3 py-2 text-xs font-bold transition ${
                    local.platformFeeMode === mode
                      ? "bg-[#FF5200] text-white"
                      : "bg-[#F4F5F7] text-[#6B7280] hover:bg-[#E5E7EB]"
                  }`}
                >
                  {mode === "FLAT" ? "Flat ₹" : "% of item total"}
                </button>
              ))}
            </div>
          </FieldRow>
          <FieldRow
            label="Value"
            hint={local.platformFeeMode === "FLAT" ? "Flat amount charged per order" : "Percentage of the item total"}
          >
            {local.platformFeeMode === "FLAT" ? (
              <NumInput value={toRupees(local.platformFeeValue)} onChange={(v) => set("platformFeeValue", toPaise(v))} suffix="₹" />
            ) : (
              <NumInput value={local.platformFeeValue} onChange={(v) => set("platformFeeValue", v)} suffix="%" max={100} />
            )}
          </FieldRow>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-[#E5E7EB] bg-white p-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[#6B7280]">3-way revenue split</h2>
        <p className="mt-1 text-xs text-[#6B7280]">
          Applies only to (delivery fee + platform fee) — GST and restaurant packaging are never split;
          packaging always goes 100% to the restaurant. Must sum to exactly 100%.
        </p>
        <div className="mt-2">
          <FieldRow label="Restaurant %">
            <NumInput value={local.splitRestaurantPct} onChange={(v) => set("splitRestaurantPct", v)} suffix="%" step={1} />
          </FieldRow>
          <FieldRow label="Rider %">
            <NumInput value={local.splitRiderPct} onChange={(v) => set("splitRiderPct", v)} suffix="%" step={1} />
          </FieldRow>
          <FieldRow label="Admin %">
            <NumInput value={local.splitAdminPct} onChange={(v) => set("splitAdminPct", v)} suffix="%" step={1} />
          </FieldRow>
        </div>
        <p className={`mt-3 text-sm font-semibold ${splitValid ? "text-green-600" : "text-red-600"}`}>
          Sum: {splitSum.toFixed(2)}% {splitValid ? "✓" : "— must equal 100%"}
        </p>
      </section>

      <div className="mt-6 flex items-center justify-end gap-3">
        {!splitValid && (
          <p className="text-sm font-semibold text-red-600">Fix the split percentages before saving</p>
        )}
        <button
          type="button"
          onClick={save}
          disabled={mutation.isPending || !splitValid}
          className="rounded-xl bg-[#FF5200] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#E04A00] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
