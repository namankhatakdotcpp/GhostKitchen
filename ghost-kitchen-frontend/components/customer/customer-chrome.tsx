"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";
import { CustomerNavbar } from "@/components/customer/customer-navbar";
import { LocationModal } from "@/components/customer/location-modal";
import { RoleBanner } from "@/components/customer/RoleBanner";
import { SplashScreen } from "@/components/ui/SplashScreen";
import { useAuthStore } from "@/store/authStore";
import { useConfigStore } from "@/store/configStore";
import { useRouter } from "next/navigation";

type CustomerChromeProps = {
  children: ReactNode;
};

function isMaintenanceActive(config: ReturnType<typeof useConfigStore.getState>["config"]): boolean {
  if (!config.maintenanceMode) return false;
  if (config.maintenanceEndsAt && new Date() > new Date(config.maintenanceEndsAt)) return false;
  return true;
}

export function CustomerChrome({ children }: CustomerChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, getCurrentUser, user, hasHydrated } = useAuthStore();
  const { config, loaded } = useConfigStore();
  const refreshed = useRef(false);
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === "undefined") return false;
    if (sessionStorage.getItem("gk-splash-shown")) return false;
    sessionStorage.setItem("gk-splash-shown", "1");
    return true;
  });

  useEffect(() => {
    // Wait for Zustand to rehydrate from localStorage before checking auth —
    // otherwise user is null and admins get incorrectly sent to /maintenance.
    if (!hasHydrated || !loaded) return;
    if (isMaintenanceActive(config) && !user?.roles?.includes("ADMIN")) {
      router.replace("/maintenance");
    }
  }, [hasHydrated, loaded, config, user, router]);

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
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
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
