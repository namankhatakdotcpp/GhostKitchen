"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ShoppingBag, UtensilsCrossed } from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/shop/orders", label: "Orders", icon: ShoppingBag },
  { href: "/shop/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/shop/analytics", label: "Analytics", icon: BarChart3 },
];

type ShopShellProps = {
  children: ReactNode;
};

export function ShopShell({ children }: ShopShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-white">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-border bg-white md:flex">
        <Link
          className="flex h-16 items-center justify-center border-b border-border text-lg font-extrabold tracking-[-0.04em]"
          href="/shop/orders"
        >
          <span className="text-text-primary">g</span>
          <span className="text-brand">k</span>
        </Link>
        <nav className="flex flex-1 flex-col items-center gap-2 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

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

      <main className="pb-24 md:pl-16 md:pb-0">{children}</main>

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
