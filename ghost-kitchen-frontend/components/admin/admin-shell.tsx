"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bike,
  ChevronRight,
  Database,
  DollarSign,
  Gift,
  HandCoins,
  HeadphonesIcon,
  LayoutDashboard,
  LineChart,
  LogOut,
  Map,
  Percent,
  Siren,
  Settings,
  ShoppingBag,
  Store,
  Tag,
  Users,
  Wallet,
} from "lucide-react";

import RoleSwitcher from "@/components/ui/role-switcher";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "Overview",
    items: [
      { href: "/admin/dashboard",      label: "Dashboard",       icon: LayoutDashboard },
      { href: "/admin/analytics",      label: "Analytics",       icon: BarChart3 },
      { href: "/admin/exec",           label: "Executive",       icon: LineChart },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/restaurants",    label: "Restaurants",     icon: Store },
      { href: "/admin/orders",         label: "Orders",          icon: ShoppingBag },
      { href: "/admin/delivery-agents",label: "Delivery Agents", icon: Bike },
      { href: "/admin/live-map",       label: "Operations Map",  icon: Map },
      { href: "/admin/ops",            label: "Ops Intelligence", icon: Siren },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/admin/payments",         label: "Payments",        icon: Wallet },
      { href: "/admin/payouts",          label: "Payouts",         icon: DollarSign },
      { href: "/admin/cod-settlements",  label: "COD Settlements", icon: HandCoins },
      { href: "/admin/coupons",          label: "Coupons",         icon: Tag },
      { href: "/admin/gift-cards",       label: "Gift Cards",      icon: Gift },
      { href: "/admin/pricing-settings", label: "Pricing",         icon: Percent },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/users",          label: "Users",           icon: Users },
      { href: "/admin/support",        label: "Support Tickets", icon: HeadphonesIcon },
      { href: "/admin/database",       label: "Database",        icon: Database },
      { href: "/admin/settings",       label: "Settings",        icon: Settings },
    ],
  },
];

function getInitials(name?: string | null) {
  if (!name) return "AD";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const userName = authUser?.name ?? "Administrator";
  const userEmail = authUser?.email ?? "";
  const initials = getInitials(authUser?.name);

  return (
    <div className="min-h-screen bg-[#F4F5F7]">

      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 flex w-[240px] flex-col bg-[#0C0C0E]">

        {/* Logo */}
        <div className="px-6 pt-7 pb-6">
          <Link href="/admin/dashboard" className="block">
            <div className="flex items-center gap-1.5">
              <Image alt="" aria-hidden="true" className="h-7 w-7 rounded-lg" height={32} src="/icon-512.png" width={32} />
              <span className="text-[22px] font-extrabold tracking-tight text-white">ghost</span>
              <span className="text-[22px] font-extrabold tracking-tight text-[#FF5200]">kitchen</span>
            </div>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/25">
              Command Center
            </p>
          </Link>
        </div>

        {/* Nav */}
        <nav aria-label="Admin navigation" className="flex-1 overflow-y-auto px-3 pb-4 space-y-6">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/25" aria-hidden="true">
                {group.label}
              </p>
              <div className="space-y-0.5" role="list">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                        isActive
                          ? "bg-[#FF5200]/15 text-[#FF5200]"
                          : "text-white/50 hover:bg-white/5 hover:text-white/85",
                      )}
                      role="listitem"
                    >
                      <Icon aria-hidden="true" className={cn("h-4 w-4 shrink-0", isActive ? "text-[#FF5200]" : "text-white/35 group-hover:text-white/70")} />
                      <span className="flex-1">{item.label}</span>
                      {isActive && <ChevronRight aria-hidden="true" className="h-3 w-3 opacity-60" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User profile */}
        <div className="border-t border-white/[0.06] px-3 py-4">
          {/* Role switcher row */}
          <div className="mb-3 flex items-center justify-between px-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25">Active role</span>
            <RoleSwitcher openUp />
          </div>

          {/* Identity card */}
          <div className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-3 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FF5200] to-[#FF8C00] text-xs font-bold text-white shadow-lg shadow-[#FF5200]/20">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white/90">{userName}</p>
              <p className="truncate text-[11px] text-white/35">{userEmail || "Administrator"}</p>
            </div>
            <button
              type="button"
              aria-label="Sign out"
              onClick={() => { logout(); router.push("/login"); }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/30 transition hover:bg-white/10 hover:text-white/70"
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <div className="pl-[240px]">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#E5E7EB] bg-white/80 px-8 backdrop-blur-md">
          <div className="flex items-center gap-2 text-sm text-[#6B7280]">
            <span className="font-semibold text-[#111827]">
              {navGroups.flatMap((g) => g.items).find((i) => pathname === i.href || pathname.startsWith(i.href + "/"))?.label ?? "Admin"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[#0C0C0E] px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-[#FF5200]">
              Admin
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#FF5200] to-[#FF8C00] text-[11px] font-bold text-white shadow shadow-[#FF5200]/30">
              {initials}
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-3.5rem)] p-7">{children}</main>
      </div>
    </div>
  );
}
