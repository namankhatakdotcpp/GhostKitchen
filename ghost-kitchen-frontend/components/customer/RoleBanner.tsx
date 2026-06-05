"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { joinRoleRooms } from "@/lib/socket";
import { useAuthStore } from "@/store/authStore";
import { useUserStore } from "@/store/userStore";
import toast from "react-hot-toast";

export function RoleBanner() {
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const { setUser } = useUserStore();
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Prevent SSR/client mismatch — only render after hydration
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;

  // ONLY trust authStore — it comes directly from the server login token.
  // Don't merge with userStore roles which may be stale persisted data.
  const roles: string[] = (authUser?.roles as string[]) ?? [];
  const activeRole = authUser?.activeRole ?? "CUSTOMER";

  const hasRestaurant = roles.includes("RESTAURANT");
  const hasDelivery   = roles.includes("DELIVERY");

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
    } catch (err: any) {
      toast.error(err?.error ?? `Could not switch to ${role} mode`);
      setLoading(false);
    }
  }

  return (
    <div className="border-b border-border bg-[#FAFAFA]">
      <div className="mx-auto flex max-w-shell flex-wrap items-center gap-3 px-4 py-2 md:px-6 lg:px-8">
        {hasRestaurant && (
          <>
            <span className="text-lg">🍳</span>
            <span className="hidden text-sm text-text-secondary sm:inline">
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
          </>
        )}
        {hasDelivery && !hasRestaurant && (
          <>
            <span className="text-lg">🚴</span>
            <span className="hidden text-sm text-text-secondary sm:inline">
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
          </>
        )}
      </div>
    </div>
  );
}
