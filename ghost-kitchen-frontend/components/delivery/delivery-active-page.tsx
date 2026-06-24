"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, MapPin, PhoneCall, Square } from "lucide-react";
import toast from "react-hot-toast";

import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useDeliveryStore } from "@/store/deliveryStore";
import { useUserStore } from "@/store/userStore";
import { useRiderPosition } from "@/hooks/useRiderLocationTracking";

// Open a Google Maps directions URL. Falls back gracefully if no API key.
function mapsLink(originLat?: number, originLng?: number, destLat?: number, destLng?: number, destAddress?: string) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (apiKey && destLat && destLng && originLat && originLng) {
    return `https://www.google.com/maps/embed/v1/directions?key=${apiKey}&origin=${originLat},${originLng}&destination=${destLat},${destLng}&mode=driving`;
  }
  // Fallback deep link
  const dest = destLat && destLng ? `${destLat},${destLng}` : encodeURIComponent(destAddress ?? "");
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

function MapCard({ title, address, destLat, destLng, originLat, originLng }: {
  title: string; address: string;
  destLat?: number; destLng?: number;
  originLat?: number; originLng?: number;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  const embedUrl = apiKey && destLat && destLng && originLat && originLng
    ? `https://www.google.com/maps/embed/v1/directions?key=${apiKey}&origin=${originLat},${originLng}&destination=${destLat},${destLng}&mode=driving`
    : null;
  const openUrl = mapsLink(originLat, originLng, destLat, destLng, address);

  return (
    <div className="rounded-[24px] border border-border bg-white p-5 shadow-[0_18px_30px_rgba(28,28,28,0.05)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">{title}</p>
      <p className="mt-3 text-xl font-bold text-text-primary">{address}</p>
      {embedUrl ? (
        <div className="mt-4 h-48 overflow-hidden rounded-[18px] border border-border">
          <iframe src={embedUrl} className="h-full w-full" style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        </div>
      ) : (
        <div className="mt-4 flex h-48 items-center justify-center rounded-[18px] border border-dashed border-border bg-[#FAFAFA]">
          <div className="text-center">
            <MapPin className="mx-auto h-6 w-6 text-brand" />
            <p className="mt-2 text-sm text-text-secondary">Map preview not available</p>
          </div>
        </div>
      )}
      <a href={openUrl} target="_blank" rel="noopener noreferrer"
        className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-brand py-2.5 text-sm font-semibold text-brand hover:bg-brand-light transition">
        <MapPin className="h-4 w-4" /> Open in Google Maps
      </a>
    </div>
  );
}

export function DeliveryActivePage() {
  const router = useRouter();
  const { agentId, activeAssignment, activeStep, advanceStep, completeDelivery } = useDeliveryStore();
  const { user } = useUserStore();
  const resolvedAgentId = user?.id ?? agentId;

  // Read the rider position from the single shared GPS watch (the location
  // tracker running in the delivery shell) — no second watchPosition here.
  const position = useRiderPosition();
  const currentLat = position?.lat;
  const currentLng = position?.lng;

  // Step-2 items checklist
  const allItems: string[] = activeAssignment?.itemsSummary ?? [];
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const allChecked = allItems.length > 0 && checkedItems.size === allItems.length;

  if (!activeAssignment) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
        <div className="rounded-[28px] border border-border bg-white p-6 text-center">
          <h1 className="text-2xl font-bold text-text-primary">No active delivery</h1>
          <p className="mt-2 text-sm text-text-secondary">Accept an incoming order to start navigation.</p>
        </div>
      </div>
    );
  }

  async function handleStep(step: 1 | 2 | 3) {
    // Steps 1 ("reached restaurant") and 2 ("picked up") are local UI
    // progress checkpoints only — this schema's OrderStatus enum has no
    // ARRIVED/PICKED_UP value, and the order is already OUT_FOR_DELIVERY
    // from the moment the shop marked it ready (before the rider even
    // accepted). Sending status: "OUT_FOR_DELIVERY" here used to PATCH the
    // order to the status it was already in — a no-op self-transition that
    // STATUS_TRANSITIONS correctly rejects (OUT_FOR_DELIVERY's only allowed
    // next state is DELIVERED), 400ing on every single tap of either
    // button. Only step 3 is a real backend transition.
    if (step !== 3) {
      advanceStep();
      return;
    }

    try {
      await api.patch(`/orders/${activeAssignment!.orderId}/status`, { status: "DELIVERED" });
    } catch {
      toast.error("Failed to update status — please retry");
      return;
    }

    completeDelivery();
    toast.success("Delivery complete! Earnings added 🎉");
    router.push("/delivery/home");
  }

  const a = activeAssignment;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 py-6 pb-32">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Active delivery</p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">Order #{a.orderId.slice(-6).toUpperCase()}</h1>
      </div>

      {/* STEP 1: Navigate to restaurant */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${activeStep >= 1 ? "bg-brand text-white" : "bg-border text-text-muted"}`}>1</span>
          <p className="text-sm font-bold text-text-primary">Go to pickup — {a.restaurantName}</p>
        </div>
        <MapCard
          title="Pickup location"
          address={a.pickupAddress}
          destLat={a.pickupLat}
          destLng={a.pickupLng}
          originLat={currentLat}
          originLng={currentLng}
        />
        <Button className="h-14 w-full rounded-[18px] text-base" disabled={activeStep !== 1} onClick={() => handleStep(1)}>
          I&apos;ve reached the restaurant ✓
        </Button>
      </section>

      {/* STEP 2: Pick up items */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${activeStep >= 2 ? "bg-brand text-white" : "bg-border text-text-muted"}`}>2</span>
          <p className="text-sm font-bold text-text-primary">Pick up order</p>
        </div>
        <div className="rounded-[20px] border border-border bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Order #{a.orderId.slice(-6).toUpperCase()}</p>
          <p className="mt-1 mb-3 text-sm text-text-secondary">Verify all items before picking up</p>
          <div className="space-y-2">
            {allItems.map((item, i) => (
              <button key={i} type="button" onClick={() => {
                const next = new Set(checkedItems);
                next.has(i) ? next.delete(i) : next.add(i);
                setCheckedItems(next);
              }} className="flex w-full items-center gap-3 text-left">
                {checkedItems.has(i) ? <CheckSquare className="h-5 w-5 shrink-0 text-brand" /> : <Square className="h-5 w-5 shrink-0 text-border" />}
                <span className={`text-sm ${checkedItems.has(i) ? "line-through text-text-muted" : "text-text-primary"}`}>{item}</span>
              </button>
            ))}
          </div>
        </div>
        <Button className="h-14 w-full rounded-[18px] text-base" disabled={activeStep !== 2 || !allChecked} onClick={() => handleStep(2)}>
          {allChecked ? "Order picked up, heading to customer →" : `Check all ${allItems.length} items first`}
        </Button>
      </section>

      {/* STEP 3: Navigate to customer */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${activeStep >= 3 ? "bg-brand text-white" : "bg-border text-text-muted"}`}>3</span>
          <p className="text-sm font-bold text-text-primary">Deliver to {a.customerName?.split(" ")[0] ?? "customer"}</p>
        </div>
        <MapCard
          title="Delivery address"
          address={a.dropoffAddress}
          destLat={a.dropoffLat}
          destLng={a.dropoffLng}
          originLat={a.pickupLat}
          originLng={a.pickupLng}
        />
        <Button className="h-14 w-full rounded-[18px] bg-success text-base hover:bg-success/90" disabled={activeStep !== 3} onClick={() => handleStep(3)}>
          Order delivered 🎉
        </Button>
      </section>

      {/* Floating call buttons */}
      <div className="fixed inset-x-4 bottom-20 z-30 mx-auto flex max-w-md gap-3">
        <a className="flex h-13 flex-1 items-center justify-center gap-2 rounded-[16px] bg-[#1C1C1C] text-sm font-bold text-white py-3"
          href={`tel:${a.restaurantPhone}`}>
          <PhoneCall className="h-4 w-4" /> Restaurant
        </a>
        <a className="flex h-13 flex-1 items-center justify-center gap-2 rounded-[16px] bg-brand text-sm font-bold text-white py-3"
          href={`tel:${a.customerPhone}`}>
          <PhoneCall className="h-4 w-4" /> Customer
        </a>
      </div>
    </div>
  );
}
