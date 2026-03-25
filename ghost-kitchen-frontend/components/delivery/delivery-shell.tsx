"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Banknote,
  Bike,
  CheckCircle2,
  Home,
  MapPinned,
  X,
} from "lucide-react";

import { getDeliveryAssignmentSeed } from "@/lib/opsData";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { useDeliveryStore } from "@/store/deliveryStore";
import type { DeliveryAssignment } from "@/types";

const navItems = [
  { href: "/delivery/home", label: "Home", icon: Home },
  { href: "/delivery/active", label: "Active", icon: MapPinned },
  { href: "/delivery/earnings", label: "Earnings", icon: Banknote },
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
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Pickup
                  </p>
                  <p className="mt-2 text-lg font-bold">{incomingAssignment.restaurantName}</p>
                  <p className="mt-1 text-sm text-text-secondary">{incomingAssignment.pickupAddress}</p>
                </div>
                <div className="rounded-[20px] bg-white px-4 py-4 text-[#0F1115]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Dropoff
                  </p>
                  <p className="mt-2 text-lg font-bold">{incomingAssignment.customerName}</p>
                  <p className="mt-1 text-sm text-text-secondary">{incomingAssignment.dropoffAddress}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-[20px] border border-white/10 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/60">Distance</p>
                  <p className="mt-2 text-2xl font-bold">{incomingAssignment.distanceKm.toFixed(1)} km</p>
                </div>
                <div className="rounded-[20px] border border-white/10 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/60">Earnings</p>
                  <p className="mt-2 text-2xl font-bold text-success">₹{incomingAssignment.estimatedEarnings}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-center text-sm font-semibold text-white/70">
              Auto-declines in {formatCountdown(secondsLeft)}
            </div>
            <button
              className="h-16 w-full rounded-[20px] bg-success text-lg font-bold text-white shadow-[0_16px_30px_rgba(27,166,114,0.28)]"
              onClick={() => {
                acceptIncoming();
                router.push("/delivery/active");
              }}
              type="button"
            >
              Accept
            </button>
            <button
              className="h-16 w-full rounded-[20px] border border-white/20 bg-transparent text-lg font-bold text-white"
              onClick={declineIncoming}
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

  useEffect(() => {
    const socket = getSocket();
    const room = `agent-${agentId}`;

    function handleConnect() {
      socket.emit("join-room", room);
    }

    function handleOrderAssigned(payload: {
      order?: DeliveryAssignment;
      pickup?: string;
      dropoff?: string;
      earnings?: number;
    }) {
      if (payload.order) {
        receiveAssignment(payload.order);
        return;
      }

      void getDeliveryAssignmentSeed().then(receiveAssignment);
    }

    socket.on("connect", handleConnect);
    socket.on("order:assigned", handleOrderAssigned);
    socket.connect();

    return () => {
      socket.emit("leave-room", room);
      socket.off("connect", handleConnect);
      socket.off("order:assigned", handleOrderAssigned);
      socket.disconnect();
    };
  }, [agentId, receiveAssignment]);

  useEffect(() => {
    const socket = getSocket();

    if (!isOnline) {
      socket.emit("agent:offline", { agentId });
      return;
    }

    socket.emit("agent:online", { agentId });
  }, [agentId, isOnline]);

  return (
    <div className="min-h-screen bg-surface">
      <IncomingAssignmentModal />
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
