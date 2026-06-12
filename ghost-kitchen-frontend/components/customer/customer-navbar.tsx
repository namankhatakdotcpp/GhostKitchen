"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import NotificationBell from "@/components/ui/NotificationBell";
import RoleSwitcher from "@/components/ui/role-switcher";
import { useCartStore } from "@/store/cartStore";
import { useUserStore } from "@/store/userStore";
import { useAuthStore } from "@/store/authStore";

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M12 21s6-5.33 6-11a6 6 0 1 0-12 0c0 5.67 6 11 6 11Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="10" fill="currentColor" r="2.25" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M4 5h2l1.6 8.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.76L20 7H7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <circle cx="10" cy="19" fill="currentColor" r="1.5" />
      <circle cx="17" cy="19" fill="currentColor" r="1.5" />
    </svg>
  );
}

export function CustomerNavbar() {
  const pathname = usePathname();
  const { items, lastUpdatedAt } = useCartStore();
  const { location, openLocationModal } = useUserStore();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [shouldBounce, setShouldBounce] = useState(false);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
  const previousCountRef = useRef(totalQuantity);

  useEffect(() => {
    if (totalQuantity > previousCountRef.current) {
      setShouldBounce(true);

      const timeoutId = window.setTimeout(() => setShouldBounce(false), 500);
      previousCountRef.current = totalQuantity;

      return () => window.clearTimeout(timeoutId);
    }

    previousCountRef.current = totalQuantity;
  }, [lastUpdatedAt, totalQuantity]);

  const isAuthPage = pathname && (pathname.startsWith("/login") || pathname.startsWith("/register"));

  if (isAuthPage) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-shell items-center justify-between gap-2 px-4 md:gap-3 md:px-6 lg:px-8">
        <Link
          aria-label="GhostKitchen — go to home"
          className="text-xl font-extrabold tracking-[-0.04em] md:text-2xl"
          href="/"
        >
          <span aria-hidden="true" className="text-text-primary">ghost</span>
          <span aria-hidden="true" className="text-brand">kitchen</span>
        </Link>

        <button
          aria-label={`Delivery location: ${location?.label ?? "Select location"}`}
          className="flex min-w-0 max-w-[160px] flex-1 items-center justify-center gap-2 rounded-pill border border-border px-3 py-2 text-[11px] font-semibold text-text-primary transition hover:border-brand/30 hover:bg-brand-light md:max-w-[360px] md:px-4 md:text-sm"
          onClick={openLocationModal}
          type="button"
        >
          <PinIcon />
          <span aria-hidden="true" className="line-clamp-1">
            {location?.label ?? "Select location"}
          </span>
          <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
            <path
              d="m7 10 5 5 5-5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>

        <div className="flex items-center gap-2 md:gap-3">
          <RoleSwitcher />
          <NotificationBell />
          <Link
            aria-label={`Cart, ${totalQuantity} item${totalQuantity !== 1 ? "s" : ""}`}
            href="/cart"
          >
            <motion.div
              animate={
                shouldBounce
                  ? { scale: [1, 1.16, 0.95, 1], y: [0, -2, 0] }
                  : { scale: 1, y: 0 }
              }
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-border text-text-primary transition hover:border-brand/30 hover:bg-brand-light hover:text-brand"
              transition={{ duration: 0.4 }}
            >
              <CartIcon />
              <span aria-hidden="true" className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[10px] font-bold text-white">
                {totalQuantity}
              </span>
            </motion.div>
          </Link>
          {isAuthenticated && user ? (
            <div className="flex items-center gap-2">
              <span className="hidden text-sm font-medium text-text-primary md:block">
                {user.name?.split(" ")[0]}
              </span>
              <button
                className="h-10 rounded-pill border border-border px-3 text-xs font-semibold text-text-secondary transition hover:border-danger/30 hover:text-danger md:h-11 md:px-4 md:text-sm"
                onClick={() => logout()}
                type="button"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link href="/login">
              <Button className="h-10 px-3 text-xs md:h-11 md:px-5 md:text-sm" variant="ghost">
                Login
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
