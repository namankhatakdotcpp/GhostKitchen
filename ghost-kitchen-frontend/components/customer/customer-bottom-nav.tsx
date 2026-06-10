"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/",
    label: "Home",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path
          d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1v-9.5Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
  {
    href: "/search",
    label: "Search",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.8" />
        <path d="m20 20-4.2-4.2" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: "/orders",
    label: "Orders",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path
          d="M7 4h10l2 4v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8l2-4Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
        <path d="M9 11h6M9 15h4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    ),
  },
  {
    href: "/favorites",
    label: "Saved",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path
          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
  {
    href: "/profile",
    label: "Profile",
    icon: (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path
          d="M5 19c1.7-3 4.2-4.5 7-4.5S17.3 16 19 19"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
];

export function CustomerBottomNav() {
  const pathname = usePathname();

  if (!pathname || pathname.startsWith("/login") || pathname.startsWith("/register")) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 px-4 py-2 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-[460px] items-center justify-between">
        {navItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              className={cn(
                "relative flex min-w-[60px] flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition",
                isActive
                  ? "bg-brand-light text-brand"
                  : "text-text-secondary hover:text-text-primary",
              )}
              href={item.href}
              key={item.href}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
