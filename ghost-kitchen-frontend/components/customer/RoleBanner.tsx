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
  const userStoreUser = useUserStore((s) => s.user);
  const { setUser } = useUserStore();
  const [loading, setLoading] = useState(false);

  // Merge roles from both stores — whichever has more is authoritative
  const authRoles: string[] = (authUser?.roles as string[]) ?? [];
  const storeRoles: string[] = (userStoreUser?.roles as string[]) ?? [];
  const allRoles = Array.from(new Set([...authRoles, ...storeRoles]));

  const hasRestaurant = allRoles.includes("RESTAURANT");
  const hasDelivery   = allRoles.includes("DELIVERY");

  // Only show when user has a secondary role but is currently in CUSTOMER mode
  const activeRole = authUser?.activeRole ?? userStoreUser?.activeRole ?? "CUSTOMER";
  if (activeRole !== "CUSTOMER") return null;
  if (!hasRestaurant && !hasDelivery) return null;

  async function switchTo(role: "RESTAURANT" | "DELIVERY") {
    setLoading(true);
    try {
      const res = await api.post("/role/switch", { role });
      const serverUser = res.data?.user;
      if (res.data?.accessToken) {
        useAuthStore.setState({ accessToken: res.data.accessToken });
      }
      if (serverUser) {
        setUser(serverUser as any);
        useAuthStore.setState({ user: serverUser as any });
        joinRoleRooms(role, serverUser.id, serverUser.restaurantId ?? null);
      }
      router.push(role === "RESTAURANT" ? "/shop/orders" : "/delivery/home");
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="border-b border-border bg-[#FAFAFA]">
      <div className="mx-auto flex max-w-shell flex-wrap items-center gap-3 px-4 py-2 md:px-6 lg:px-8">
        {hasRestaurant && (
          <>
            <span className="text-lg">🍳</span>
            <span className="text-sm text-text-secondary hidden sm:inline">You have a restaurant registered</span>
            <button
              type="button"
              disabled={loading}
              onClick={() => switchTo("RESTAURANT")}
              className="rounded-full bg-teal-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-60 transition"
            >
              {loading ? "Switching…" : "Go to Restaurant Dashboard →"}
            </button>
          </>
        )}
        {hasDelivery && !hasRestaurant && (
          <>
            <span className="text-lg">🚴</span>
            <span className="text-sm text-text-secondary hidden sm:inline">You&apos;re registered as a rider</span>
            <button
              type="button"
              disabled={loading}
              onClick={() => switchTo("DELIVERY")}
              className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {loading ? "Switching…" : "Go to Rider Dashboard →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
