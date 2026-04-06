"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { CustomerBottomNav } from "@/components/customer/customer-bottom-nav";
import { CustomerNavbar } from "@/components/customer/customer-navbar";
import { LocationModal } from "@/components/customer/location-modal";

type CustomerChromeProps = {
  children: ReactNode;
};

export function CustomerChrome({ children }: CustomerChromeProps) {
  const pathname = usePathname();
  const useImmersivePageChrome = pathname
    ? /^\/restaurant\/[^/]+$/.test(pathname) || /^\/order\/[^/]+\/track$/.test(pathname)
    : false;

  return (
    <>
      {!useImmersivePageChrome ? <CustomerNavbar /> : null}
      {!useImmersivePageChrome ? <LocationModal /> : null}
      <main className={useImmersivePageChrome ? "" : "pb-24 md:pb-8"}>
        {children}
      </main>
      {!useImmersivePageChrome ? <CustomerBottomNav /> : null}
    </>
  );
}
