"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";
import { CustomerNavbar } from "@/components/customer/customer-navbar";
import { LocationModal } from "@/components/customer/location-modal";
import { RoleBanner } from "@/components/customer/RoleBanner";
import { useAuthStore } from "@/store/authStore";

type CustomerChromeProps = {
  children: ReactNode;
};

export function CustomerChrome({ children }: CustomerChromeProps) {
  const pathname = usePathname();
  const { isAuthenticated, getCurrentUser } = useAuthStore();
  const refreshed = useRef(false);

  // Refresh user data from server once per mount so roles are always current.
  // Without this, a user who registered a restaurant after logging in would
  // not see the role-switch banner until they log out and back in.
  useEffect(() => {
    if (isAuthenticated && !refreshed.current) {
      refreshed.current = true;
      getCurrentUser().catch(() => { /* silent — stale data is better than crashing */ });
    }
  }, [isAuthenticated, getCurrentUser]);
  const useImmersivePageChrome = pathname
    ? /^\/restaurant\/[^/]+$/.test(pathname) || /^\/order\/[^/]+\/track$/.test(pathname)
    : false;

  return (
    <>
      {!useImmersivePageChrome ? <CustomerNavbar /> : null}
      {!useImmersivePageChrome ? <RoleBanner /> : null}
      {!useImmersivePageChrome ? <LocationModal /> : null}
      <main className={useImmersivePageChrome ? "" : "pb-24 md:pb-8"}>
        {children}
      </main>
      {!useImmersivePageChrome ? <CustomerBottomNav /> : null}
    </>
  );
}
