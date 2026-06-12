"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

import toast from "react-hot-toast";
import api from "@/lib/api";
import { joinRoleRooms } from "@/lib/socket";
import { useUserStore, type AppRole } from "@/store/userStore";
import { useAuthStore } from "@/store/authStore";

const ROLE_CONFIG: Record<AppRole, {
  label: string;
  icon: string;
  activeColor: string;
  href: string;
}> = {
  CUSTOMER: {
    label: "Customer",
    icon: "🛒",
    activeColor: "bg-[#FF5200] text-white",
    href: "/",
  },
  RESTAURANT: {
    label: "My restaurant",
    icon: "🍳",
    activeColor: "bg-teal-600 text-white",
    href: "/shop/orders",
  },
  DELIVERY: {
    label: "Rider mode",
    icon: "🚴",
    activeColor: "bg-blue-600 text-white",
    href: "/delivery/home",
  },
  ADMIN: {
    label: "Admin",
    icon: "⚙️",
    activeColor: "bg-gray-800 text-white",
    href: "/admin/dashboard",
  },
};

export default function RoleSwitcher({ openUp = false }: { openUp?: boolean }) {
  const router = useRouter();
  const { setUser, setActiveRole } = useUserStore();
  const authUser = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  if (!mounted) return null;

  // Read user from authStore (populated on login); fall back to userStore for legacy
  const rawUser = authUser ?? useUserStore.getState().user;
  const user = rawUser
    ? { ...rawUser, activeRole: rawUser.activeRole as AppRole, roles: (rawUser.roles ?? ["CUSTOMER"]) as AppRole[] }
    : null;

  if (!user) return null;

  const activeConfig = ROLE_CONFIG[user.activeRole];
  const userRoles: AppRole[] = user.roles ?? ["CUSTOMER"];
  // Fall back to secondRole / restaurantId so the switcher works even when
  // the roles[] array is stale in the persisted store.
  const hasRestaurant =
    userRoles.includes("RESTAURANT") ||
    user.secondRole === "RESTAURANT" ||
    !!user.restaurantId;
  const hasDelivery =
    userRoles.includes("DELIVERY") ||
    user.secondRole === "DELIVERY";
  const hasSecondRole = hasRestaurant || hasDelivery;

  // Build the effective roles list for the dropdown, adding any role detected
  // via secondRole that may be missing from the stale roles[] array.
  const effectiveRoles: AppRole[] = [...new Set([
    ...userRoles,
    ...(hasRestaurant && !userRoles.includes("RESTAURANT") ? ["RESTAURANT" as AppRole] : []),
    ...(hasDelivery   && !userRoles.includes("DELIVERY")   ? ["DELIVERY"   as AppRole] : []),
  ])];

  async function switchRole(role: AppRole) {
    if (role === user!.activeRole) { setOpen(false); return; }
    setSwitching(true);
    setOpen(false); // close immediately — prevents double-click retries
    try {
      const res = await api.post("/role/switch", { role });
      // Use server-returned user (has correct roles, not stale frontend state)
      const serverUser = res.data?.user ?? { ...user!, activeRole: role };
      if (res.data?.accessToken) {
        useAuthStore.setState({ accessToken: res.data.accessToken });
      }
      setUser(serverUser as any);
      setActiveRole(role);
      useAuthStore.setState({ user: serverUser as any });
      joinRoleRooms(role, serverUser.id, serverUser.restaurantId ?? null);
      router.push(ROLE_CONFIG[role].href);
    } catch (err: any) {
      const msg = err?.error ?? err?.message ?? "Role switch failed. Please try again.";
      toast.error(msg);
    } finally {
      setSwitching(false);
    }
  }

  function goRegister(type: "restaurant" | "rider") {
    setOpen(false);
    router.push(`/onboarding/${type}`);
  }

  return (
    <div className="relative">
      <button
        aria-label={`Switch role. Current role: ${activeConfig.label}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-sm font-semibold transition ${activeConfig.activeColor}`}
        disabled={switching}
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span aria-hidden="true">{activeConfig.icon}</span>
        <span className="hidden sm:inline">{activeConfig.label}</span>
        <svg aria-hidden="true" className="h-3 w-3" fill="currentColor" viewBox="0 0 12 12">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div
            role="listbox"
            aria-label="Switch role"
            className={`absolute right-0 ${openUp ? "bottom-full mb-2" : "top-full mt-2"} z-50 w-56 max-h-[80vh] overflow-y-auto overflow-x-hidden rounded-xl border border-[#E8E8E8] bg-white shadow-xl`}
          >
            <div className="border-b border-[#F5F5F5] px-3 py-2">
              <p aria-hidden="true" className="text-xs font-semibold text-[#93959F]">Switch view</p>
            </div>

            {/* Available roles */}
            {effectiveRoles.map((role) => {
              const cfg = ROLE_CONFIG[role];
              if (!cfg) return null;
              const isActive = role === user.activeRole;
              return (
                <button
                  role="option"
                  aria-selected={isActive}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#F5F5F5] ${isActive ? "bg-orange-50" : ""}`}
                  key={role}
                  onClick={() => switchRole(role)}
                  type="button"
                >
                  <span aria-hidden="true" className="text-lg">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isActive ? "text-[#FF5200]" : "text-[#1C1C1C]"}`}>
                      {cfg.label}
                    </p>
                    {isActive && <p className="text-xs text-[#93959F]">Currently active</p>}
                  </div>
                  {isActive && (
                    <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-[#FF5200]" fill="none" viewBox="0 0 16 16">
                      <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </button>
              );
            })}

            {/* Register options */}
            {!hasSecondRole && (
              <div className="border-t border-[#F5F5F5]">
                <p className="px-4 pt-2 text-xs font-semibold text-[#93959F]">Expand your account</p>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#F5F5F5]"
                  onClick={() => goRegister("restaurant")}
                  type="button"
                >
                  <span className="text-lg">🍳</span>
                  <div>
                    <p className="text-sm font-medium text-[#1C1C1C]">Open a restaurant</p>
                    <p className="text-xs text-[#93959F]">List your restaurant on GhostKitchen</p>
                  </div>
                </button>
                <button
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[#F5F5F5]"
                  onClick={() => goRegister("rider")}
                  type="button"
                >
                  <span className="text-lg">🚴</span>
                  <div>
                    <p className="text-sm font-medium text-[#1C1C1C]">Become a rider</p>
                    <p className="text-xs text-[#93959F]">Earn money delivering food</p>
                  </div>
                </button>
              </div>
            )}

            {hasRestaurant && !hasDelivery && !hasSecondRole && (
              <div className="border-t border-[#F5F5F5] px-4 py-2">
                <p className="text-xs text-[#93959F]">Restaurant owners cannot be riders</p>
              </div>
            )}

            {hasDelivery && !hasRestaurant && (
              <div className="border-t border-[#F5F5F5] px-4 py-2">
                <p className="text-xs text-[#93959F]">You already have a rider account</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
