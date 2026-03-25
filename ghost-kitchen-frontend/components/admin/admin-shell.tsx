"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bike,
  LayoutDashboard,
  LogOut,
  Settings,
  ShoppingBag,
  Store,
  Users,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/restaurants", label: "Restaurants", icon: Store },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/delivery-agents", label: "Delivery Agents", icon: Bike },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/payouts", label: "Payouts", icon: Wallet },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

type AdminShellProps = {
  children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-surface">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-white">
        <div className="border-b border-border px-5 py-5">
          <div className="flex items-center gap-3">
            <Link className="text-2xl font-extrabold tracking-[-0.04em]" href="/admin/dashboard">
              <span className="text-text-primary">ghost</span>
              <span className="text-brand">kitchen</span>
            </Link>
            <span className="rounded-pill bg-danger px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
              Admin
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                className={cn(
                  "flex items-center gap-3 rounded-r-xl border-l-2 px-4 py-3 text-sm font-medium transition",
                  isActive
                    ? "border-brand bg-brand-light text-brand"
                    : "border-transparent text-text-secondary hover:bg-[#FAFAFA] hover:text-text-primary",
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border px-4 py-4">
          <div className="flex items-center gap-3 rounded-2xl bg-[#FAFAFA] p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-light text-sm font-bold text-brand">
              AK
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-1 text-sm font-semibold text-text-primary">
                Aditi Khanna
              </p>
              <p className="line-clamp-1 text-xs text-text-secondary">
                Operations Admin
              </p>
            </div>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-secondary transition hover:border-brand/30 hover:text-brand"
              type="button"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="pl-60">
        <main className="min-h-screen p-6">{children}</main>
      </div>
    </div>
  );
}
