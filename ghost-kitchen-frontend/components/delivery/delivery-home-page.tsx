"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Power, Wallet } from "lucide-react";
import { useState } from "react";

import api from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useDeliveryStore } from "@/store/deliveryStore";
import { useUserStore } from "@/store/userStore";

export function DeliveryHomePage() {
  const { isOnline, setOnline, agentId } = useDeliveryStore();
  const { user } = useUserStore();
  const resolvedAgentId = user?.id ?? agentId;
  const [locationError, setLocationError] = useState("");

  const earningsQuery = useQuery({
    queryKey: ["delivery-earnings-today"],
    queryFn: () => api.get("/delivery/earnings?period=today").then(r => r.data),
  });

  async function toggleOnline() {
    if (!isOnline) {
      // Going online — need GPS
      setLocationError("");
      if (!navigator.geolocation) {
        setLocationError("Geolocation is not supported by your browser");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          try {
            await api.patch("/delivery/status", { isAvailable: true, isOnDuty: true, currentLat: lat, currentLng: lng });
            const socket = getSocket();
            socket.emit("agent:online", { agentId: resolvedAgentId });
            socket.emit("agent:location", { agentId: resolvedAgentId, lat, lng });
            setOnline(true);
          } catch (err) {
            console.error("Status update failed", err);
            setOnline(true); // optimistic
          }
        },
        () => setLocationError("Location permission denied. Please enable location access to go online."),
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      // Going offline
      try {
        await api.patch("/delivery/status", { isAvailable: false, isOnDuty: false });
        const socket = getSocket();
        socket.emit("agent:offline", { agentId: resolvedAgentId });
      } catch { /* optimistic */ }
      setOnline(false);
    }
  }

  const earnings = earningsQuery.data;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-md flex-col gap-4 px-4 py-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
          Delivery partner
        </p>
        <h1 className="mt-2 text-3xl font-bold text-text-primary">
          Hi, {user?.name?.split(" ")[0] ?? "Rider"} 👋
        </h1>
      </div>

      {/* Earnings card */}
      <div className="rounded-[28px] border border-border bg-white p-5 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-light text-brand">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm text-text-secondary">Today&apos;s earnings</p>
            <p className="mt-0.5 text-3xl font-bold text-text-primary">
              ₹{earnings?.total ?? "--"}
            </p>
          </div>
        </div>
        {earnings && (
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
            <div className="text-center">
              <p className="text-xl font-bold text-text-primary">{earnings.deliveries}</p>
              <p className="text-xs text-text-secondary">Deliveries</p>
            </div>
            <div className="text-center border-x border-border">
              <p className="text-xl font-bold text-text-primary">₹{earnings.avgPerDelivery}</p>
              <p className="text-xs text-text-secondary">Avg / trip</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-text-primary">0h</p>
              <p className="text-xs text-text-secondary">Online</p>
            </div>
          </div>
        )}
      </div>

      {/* Online toggle */}
      <motion.button
        animate={isOnline ? { scale: [1, 1.02, 1] } : { scale: 1 }}
        className={`flex h-20 w-full items-center justify-center gap-3 rounded-[999px] text-xl font-bold text-white shadow-[0_18px_40px_rgba(28,28,28,0.12)] transition-colors ${
          isOnline ? "bg-success" : "bg-[#1C1C1C]"
        }`}
        onClick={toggleOnline}
        transition={{ duration: 0.22 }}
        type="button"
      >
        <Power className="h-6 w-6" />
        {isOnline ? "You are online" : "Go Online"}
      </motion.button>

      {locationError && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{locationError}</p>
      )}

      {/* Status card */}
      <div className="rounded-[28px] border border-border bg-white p-5 shadow-[0_20px_40px_rgba(28,28,28,0.05)]">
        <div className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${isOnline ? "bg-success animate-pulse" : "bg-gray-300"}`} />
          <h2 className="text-xl font-bold text-text-primary">
            {isOnline ? "Waiting for orders…" : "You are offline"}
          </h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {isOnline
            ? "Stay ready. A full-screen assignment card will appear the moment an order is assigned to you."
            : "Go online to start receiving delivery requests from nearby restaurants."}
        </p>
      </div>
    </div>
  );
}
