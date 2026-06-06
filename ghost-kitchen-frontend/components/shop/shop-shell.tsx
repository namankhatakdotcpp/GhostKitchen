"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { BarChart3, ChevronDown, Settings, ShoppingBag, Store, UtensilsCrossed } from "lucide-react";

import RoleSwitcher from "@/components/ui/role-switcher";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useShopStore } from "@/store/shopStore";

const navItems = [
  { href: "/shop/orders", label: "Orders", icon: ShoppingBag },
  { href: "/shop/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/shop/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/shop/settings", label: "Settings", icon: Settings },
];

function RestaurantSelector() {
  const { restaurants, activeRestaurantId, setRestaurants, setActiveRestaurant, activeRestaurant } = useShopStore();
  const active = activeRestaurant();

  useEffect(() => {
    api.get("/role/my-restaurants")
      .then(r => {
        const list = r.data?.restaurants ?? [];
        if (list.length > 0) setRestaurants(list);
      })
      .catch(() => { /* silently fail */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (restaurants.length <= 1) return null;

  return (
    <div className="border-b border-border px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted mb-1">Restaurant</p>
      <select
        value={activeRestaurantId ?? ""}
        onChange={e => setActiveRestaurant(e.target.value)}
        className="w-full rounded-xl border border-border bg-white px-2 py-1.5 text-xs font-medium text-text-primary focus:border-brand focus:outline-none"
      >
        {restaurants.map(r => (
          <option key={r.id} value={r.id}>
            {r.name} ({(r.address as any)?.city ?? "—"})
          </option>
        ))}
      </select>
    </div>
  );
}

type ShopShellProps = {
  children: ReactNode;
};

export function ShopShell({ children }: ShopShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-white">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-border bg-white md:flex">
        <div className="flex h-16 flex-col items-center justify-center gap-1 border-b border-border px-2">
          <Link className="text-lg font-extrabold tracking-[-0.04em]" href="/shop/orders">
            <span className="text-text-primary">g</span>
            <span className="text-brand">k</span>
          </Link>
          <RoleSwitcher />
        </div>

        {/* Shown only on wide sidebars (this sidebar is narrow) */}
        <nav className="flex flex-1 flex-col items-center gap-2 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-2xl transition",
                  isActive
                    ? "bg-brand-light text-brand"
                    : "text-text-secondary hover:bg-[#FAFAFA] hover:text-text-primary",
                )}
                href={item.href}
                key={item.href}
                title={item.label}
              >
                <Icon className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Wide sidebar on larger screens showing restaurant selector */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-white xl:flex">
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Link className="text-xl font-extrabold tracking-[-0.04em]" href="/shop/orders">
            <span className="text-text-primary">ghost</span>
            <span className="text-brand">kitchen</span>
          </Link>
          <RoleSwitcher />
        </div>

        <RestaurantSelector />

        <nav className="flex flex-1 flex-col gap-1 px-3 py-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  isActive
                    ? "bg-brand-light text-brand"
                    : "text-text-secondary hover:bg-[#FAFAFA] hover:text-text-primary",
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile top header with logo + role switcher */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-white px-4 md:hidden">
        <Link className="text-xl font-extrabold tracking-[-0.04em]" href="/shop/orders">
          <span className="text-text-primary">ghost</span>
          <span className="text-brand">kitchen</span>
        </Link>
        <RoleSwitcher />
      </header>

      <main className="pt-14 pb-24 md:pt-0 md:pl-[72px] md:pb-0 xl:pl-56">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 py-2 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl px-4 py-2 text-[11px] font-semibold",
                  isActive ? "bg-brand-light text-brand" : "text-text-secondary",
                )}
                href={item.href}
                key={item.href}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
