"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  Bike,
  CheckCircle2,
  Home,
  MapPinned,
  Wallet,
  X,
} from "lucide-react";

import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { useDeliveryStore } from "@/store/deliveryStore";
import { useUserStore } from "@/store/userStore";
import { useRiderLocationTracking } from "@/hooks/useRiderLocationTracking";
import RoleSwitcher from "@/components/ui/role-switcher";
import type { DeliveryAssignment } from "@/types";

const navItems = [
  { href: "/delivery/home", label: "Home", icon: Home },
  { href: "/delivery/active", label: "Active", icon: MapPinned },
  { href: "/delivery/earnings", label: "Earnings", icon: Banknote },
  { href: "/delivery/cod-dues", label: "COD Dues", icon: Wallet },
];

type DeliveryShellProps = {
  children: ReactNode;
};

function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(seconds, 0);
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(
    safeSeconds % 60,
  ).padStart(2, "0")}`;
}

function IncomingAssignmentModal() {
  const router = useRouter();
  const { incomingAssignment, acceptIncoming, declineIncoming } = useDeliveryStore();
  const [secondsLeft, setSecondsLeft] = useState(30);
  const [isAccepting, setIsAccepting] = useState(false);

  useEffect(() => {
    if (!incomingAssignment) {
      setSecondsLeft(30);
      return;
    }

    setSecondsLeft(30);
    const intervalId = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          declineIncoming();
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [declineIncoming, incomingAssignment]);

  if (!incomingAssignment) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[70] flex min-h-screen flex-col bg-[#0F1115] px-5 py-6 text-white"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
      >
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]">
              <span className="track-pulse h-2.5 w-2.5 rounded-full bg-brand" />
              Incoming order
            </span>
            <button
              className="rounded-full border border-white/15 p-2 text-white/80"
              onClick={declineIncoming}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-10 flex-1">
            <motion.div
              animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
              className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-brand/20"
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <Bike className="h-12 w-12 text-brand" />
            </motion.div>

            <div className="mt-8 rounded-[28px] bg-white/6 p-5 backdrop-blur">
              <div className="grid gap-4">
                <div className="rounded-[20px] bg-white px-4 py-4 text-[#0F1115]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Pickup</p>
                  <p className="mt-2 text-lg font-bold">{incomingAssignment.restaurantName}</p>
                  <p className="mt-1 text-sm text-text-secondary">{incomingAssignment.pickupAddress}</p>
                  {incomingAssignment.pickupLat && incomingAssignment.pickupLng && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${incomingAssignment.pickupLat},${incomingAssignment.pickupLng}`}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 underline">
                      📍 Get directions
                    </a>
                  )}
                </div>
                <div className="rounded-[20px] bg-white px-4 py-4 text-[#0F1115]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Dropoff</p>
                  <p className="mt-2 text-lg font-bold">{incomingAssignment.customerName}</p>
                  <p className="mt-1 text-sm text-text-secondary">{incomingAssignment.dropoffAddress}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-[20px] border border-white/10 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">Distance</p>
                  <p className="mt-1.5 text-xl font-bold">
                    {typeof incomingAssignment.distanceKm === "number" ? `${incomingAssignment.distanceKm.toFixed(1)} km` : "--"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-white/10 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-white/60">Delivery fee</p>
                  <p className="mt-1.5 text-xl font-bold">
                    {typeof incomingAssignment.distanceKm === "number" && incomingAssignment.distanceKm > 0
                      ? `~${incomingAssignment.distanceKm.toFixed(1)} km`
                      : "—"}
                  </p>
                </div>
                <div className="rounded-[20px] border border-success/30 bg-success/10 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-success/80">You earn</p>
                  <p className="mt-1.5 text-xl font-bold text-success">₹{incomingAssignment.estimatedEarnings}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-center text-sm font-semibold text-white/70">
              Auto-declines in {formatCountdown(secondsLeft)}
            </div>
            <button
              className="h-16 w-full rounded-[20px] bg-success text-lg font-bold text-white shadow-[0_16px_30px_rgba(27,166,114,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isAccepting}
              onClick={async () => {
                setIsAccepting(true);
                await acceptIncoming();
                setIsAccepting(false);
                // Only navigate if the accept actually succeeded — on failure
                // (offer expired / already claimed) the store clears
                // incomingAssignment and surfaces offerError instead.
                if (useDeliveryStore.getState().activeAssignment) {
                  router.push("/delivery/active");
                }
              }}
              type="button"
            >
              {isAccepting ? "Accepting…" : "Accept"}
            </button>
            <button
              className="h-16 w-full rounded-[20px] border border-white/20 bg-transparent text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isAccepting}
              onClick={() => void declineIncoming()}
              type="button"
            >
              Decline
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export function DeliveryShell({ children }: DeliveryShellProps) {
  const pathname = usePathname();
  const {
    agentId,
    isOnline,
    activeAssignment,
    receiveAssignment,
  } = useDeliveryStore();
  const { user } = useUserStore();
  const resolvedAgentId = user?.id ?? agentId;

  // Stream GPS to the backend while online. Unmounting the shell (logout /
  // role switch / leaving the portal) or going offline stops tracking.
  const trackingStatus = useRiderLocationTracking(isOnline);

  useEffect(() => {
    const socket = getSocket();
    const room = `agent-${resolvedAgentId}`;

    function handleConnect() {
      socket.emit("join-room", room);
    }

    // order:offer = "you've been offered this order, respond within 30s" —
    // shows the accept/decline modal. This used to listen for order:assigned,
    // which the backend now only emits AFTER real acceptance (to the
    // customer/shop rooms, not this rider's room) — listening for it here
    // would never have fired in the new flow.
    //
    // The raw socket payload is mapped field-by-field rather than blindly
    // cast to DeliveryAssignment — it used to be cast directly, but the
    // payload's actual shape (pickup/dropoff nested objects, no top-level
    // distanceKm) never matched the type. That mismatch is exactly what
    // crashed this modal with "Cannot read properties of undefined (reading
    // 'toFixed')" on incomingAssignment.distanceKm — the field simply never
    // existed on the payload. Every numeric field gets an explicit fallback
    // here as defense-in-depth even though the backend now sends distanceKm.
    function handleOrderOffer(payload: any) {
      const raw = payload.order ?? payload;
      if (!raw?.orderId) return;

      const assignment: DeliveryAssignment = {
        orderId: raw.orderId,
        restaurantName: raw.restaurantName ?? raw.pickup?.name ?? "Restaurant",
        pickupAddress: raw.pickupAddress ?? "",
        dropoffAddress: raw.dropoffAddress ?? "",
        distanceKm: typeof raw.distanceKm === "number" ? raw.distanceKm : 0,
        estimatedEarnings: typeof raw.estimatedEarnings === "number" ? raw.estimatedEarnings : 0,
        itemsSummary: Array.isArray(raw.items)
          ? raw.items.map((i: any) => i?.name).filter(Boolean)
          : [],
        customerName: raw.customerName ?? "Customer",
        customerPhone: raw.customerPhone ?? "",
        restaurantPhone: raw.restaurantPhone ?? "",
        pickupLat: raw.pickupLat ?? raw.pickup?.lat ?? 0,
        pickupLng: raw.pickupLng ?? raw.pickup?.lng ?? 0,
        dropoffLat: raw.dropoffLat ?? 0,
        dropoffLng: raw.dropoffLng ?? 0,
      };

      receiveAssignment(assignment);
    }

    socket.on("connect", handleConnect);
    socket.on("order:offer", handleOrderOffer);
    socket.connect();

    return () => {
      socket.emit("leave-room", room);
      socket.off("connect", handleConnect);
      socket.off("order:offer", handleOrderOffer);
      socket.disconnect();
    };
  }, [resolvedAgentId, receiveAssignment]);

  useEffect(() => {
    const socket = getSocket();

    if (!isOnline) {
      socket.emit("agent:offline", { agentId: resolvedAgentId });
      return;
    }

    socket.emit("agent:online", { agentId: resolvedAgentId });
  }, [resolvedAgentId, isOnline]);

  return (
    <div className="min-h-screen bg-surface">
      <IncomingAssignmentModal />
      <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-border bg-white/95 px-4 backdrop-blur">
        <span className="flex items-center gap-1.5 text-base font-extrabold tracking-tight">
          <Image alt="" aria-hidden="true" className="h-6 w-6 rounded-lg" height={32} src="/icon-512.png" width={32} />
          <span className="text-text-primary">ghost</span><span className="text-brand">kitchen</span>
        </span>
        <RoleSwitcher />
      </header>
      {isOnline && (trackingStatus === "denied" || trackingStatus === "unavailable") && (
        <div className="bg-red-50 px-4 py-2 text-center text-xs font-semibold text-red-600">
          {trackingStatus === "denied"
            ? "Location access is blocked. Enable it so customers and dispatch can see you live."
            : "Location isn't available on this device, so live tracking is off."}
        </div>
      )}
      <main className="pb-24">{children}</main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/96 px-3 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-[18px] px-2 py-3 text-[11px] font-bold transition",
                  isActive
                    ? "bg-brand-light text-brand"
                    : "text-text-secondary",
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
          {activeAssignment ? (
            <div className="inline-flex items-center gap-2 rounded-[18px] bg-success/10 px-3 py-3 text-[11px] font-bold text-success">
              <CheckCircle2 className="h-4 w-4" />
              Active
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
