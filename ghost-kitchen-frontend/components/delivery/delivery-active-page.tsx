"use client";

import { useEffect } from "react";
import { Link2, PhoneCall } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSocket } from "@/lib/socket";
import { useDeliveryStore } from "@/store/deliveryStore";

function MapCard({
  title,
  address,
  type,
}: {
  title: string;
  address: string;
  type: "pickup" | "dropoff";
}) {
  return (
    <div className="rounded-[24px] border border-border bg-white p-5 shadow-[0_18px_30px_rgba(28,28,28,0.05)]">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
        {title}
      </p>
      <p className="mt-3 text-xl font-bold text-text-primary">{address}</p>
      <div className="mt-4 flex h-48 items-center justify-center rounded-[20px] border border-dashed border-border bg-[#FAFAFA]">
        <div className="text-center">
          <Link2 className="mx-auto h-6 w-6 text-brand" />
          <p className="mt-3 text-sm font-semibold text-text-primary">
            {type === "pickup" ? "Pickup map" : "Customer map"}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Google Maps embed placeholder
          </p>
        </div>
      </div>
    </div>
  );
}

export function DeliveryActivePage() {
  const { agentId, activeAssignment, activeStep, advanceStep, completeDelivery } =
    useDeliveryStore();

  useEffect(() => {
    if (!activeAssignment) {
      return;
    }

    const socket = getSocket();

    function emitLocation() {
      if (!navigator.geolocation) {
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          socket.emit("agent:location", {
            agentId,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => undefined,
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 10000,
        },
      );
    }

    emitLocation();
    const intervalId = window.setInterval(emitLocation, 10000);

    return () => window.clearInterval(intervalId);
  }, [activeAssignment, agentId]);

  if (!activeAssignment) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
        <div className="rounded-[28px] border border-border bg-white p-6 text-center shadow-[0_18px_30px_rgba(28,28,28,0.05)]">
          <h1 className="text-2xl font-bold text-text-primary">No active delivery</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Accept an incoming order to start navigation.
          </p>
        </div>
      </div>
    );
  }

  function handleStatusTap(step: 1 | 2 | 3) {
    if (!activeAssignment) return;

    const socket = getSocket();
    const statusByStep = {
      1: "CONFIRMED",
      2: "OUT_FOR_DELIVERY",
      3: "DELIVERED",
    } as const;

    socket.emit("order:status", {
      orderId: activeAssignment.orderId,
      status: statusByStep[step],
      agentId,
    });

    if (step === 3) {
      completeDelivery();
      return;
    }

    advanceStep();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6 pb-32">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
          Active delivery
        </p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">
          Order #{activeAssignment.orderId}
        </h1>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <MapCard
          address={activeAssignment.pickupAddress}
          title="Step 1: Go to Ghost Biryani House"
          type="pickup"
        />
        <Button
          className="h-16 rounded-[20px] text-lg"
          disabled={activeStep !== 1}
          onClick={() => handleStatusTap(1)}
        >
          I&apos;ve reached restaurant
        </Button>

        <div className="rounded-[24px] border border-border bg-white p-5 shadow-[0_18px_30px_rgba(28,28,28,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
            Step 2: Pick up order
          </p>
          <div className="mt-4 space-y-2 text-sm text-text-primary">
            {activeAssignment.itemsSummary.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </div>
        <Button
          className="h-16 rounded-[20px] text-lg"
          disabled={activeStep !== 2}
          onClick={() => handleStatusTap(2)}
        >
          Order picked up
        </Button>

        <MapCard
          address={activeAssignment.dropoffAddress}
          title="Step 3: Go to customer"
          type="dropoff"
        />
        <Button
          className="h-16 rounded-[20px] text-lg"
          disabled={activeStep !== 3}
          onClick={() => handleStatusTap(3)}
        >
          Order delivered
        </Button>
      </div>

      <div className="fixed inset-x-0 bottom-20 z-30 mx-auto flex w-[calc(100%-2rem)] max-w-md gap-3">
        <a
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-[18px] bg-[#1C1C1C] text-base font-bold text-white"
          href={`tel:${activeAssignment.restaurantPhone}`}
        >
          <PhoneCall className="h-5 w-5" />
          Call Restaurant
        </a>
        <a
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-[18px] bg-brand text-base font-bold text-white"
          href={`tel:${activeAssignment.customerPhone}`}
        >
          <PhoneCall className="h-5 w-5" />
          Call Customer
        </a>
      </div>
    </div>
  );
}
