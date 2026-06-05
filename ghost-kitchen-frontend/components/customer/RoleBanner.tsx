"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { joinRoleRooms } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import { useUserStore } from "@/store/userStore";

export function RoleBanner() {
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const { setUser, setActiveRole } = useUserStore();
  const [loading, setLoading] = useState(false);

  if (!authUser) return null;

  const roles: string[] = authUser.roles ?? [];
  const active = authUser.activeRole;

  const hasRestaurant = roles.includes("RESTAURANT");
  const hasDelivery = roles.includes("DELIVERY");

  // Only show when user is currently in CUSTOMER mode but has another role registered
  if (active !== "CUSTOMER") return null;
  if (!hasRestaurant && !hasDelivery) return null;

  async function switchTo(role: "RESTAURANT" | "DELIVERY") {
    setLoading(true);
    try {
      const res = await api.post("/role/switch", { role });
      if (res.data?.accessToken) {
        useAuthStore.setState({ accessToken: res.data.accessToken });
      }
      const updated = { ...authUser!, activeRole: role };
      setUser(updated as any);
      useAuthStore.setState({ user: updated as any });
      joinRoleRooms(role, authUser!.id, authUser!.restaurantId ?? null);
      router.push(role === "RESTAURANT" ? "/shop/orders" : "/delivery/home");
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="border-b border-border bg-[#FAFAFA]">
      <div className="mx-auto flex max-w-shell items-center justify-between gap-3 px-4 py-2 md:px-6 lg:px-8">
        {hasRestaurant && (
          <div className="flex items-center gap-3">
            <span className="text-lg">🍳</span>
            <span className="text-sm text-text-secondary">
              You have a restaurant registered
            </span>
            <button
              type="button"
              disabled={loading}
              onClick={() => switchTo("RESTAURANT")}
              className="rounded-full bg-teal-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-60 transition"
            >
              {loading ? "Switching…" : "Go to Restaurant Dashboard →"}
            </button>
          </div>
        )}
        {hasDelivery && !hasRestaurant && (
          <div className="flex items-center gap-3">
            <span className="text-lg">🚴</span>
            <span className="text-sm text-text-secondary">
              You&apos;re registered as a rider
            </span>
            <button
              type="button"
              disabled={loading}
              onClick={() => switchTo("DELIVERY")}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {loading ? "Switching…" : "Go to Rider Dashboard →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
