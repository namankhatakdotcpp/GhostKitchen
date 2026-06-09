"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";
import { CustomerNavbar } from "@/components/customer/customer-navbar";
import { LocationModal } from "@/components/customer/location-modal";
import { RoleBanner } from "@/components/customer/RoleBanner";
import { useAuthStore } from "@/store/authStore";
import { useConfigStore } from "@/store/configStore";
import { useRouter } from "next/navigation";

type CustomerChromeProps = {
  children: ReactNode;
};

export function CustomerChrome({ children }: CustomerChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, getCurrentUser, user } = useAuthStore();
  const { config, loaded } = useConfigStore();
  const refreshed = useRef(false);

  useEffect(() => {
    if (loaded && config.maintenanceMode && !user?.roles?.includes("ADMIN")) {
      router.replace("/maintenance");
    }
  }, [loaded, config.maintenanceMode, user, router]);

  // Refresh user data from server once per mount so roles are always current.
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
