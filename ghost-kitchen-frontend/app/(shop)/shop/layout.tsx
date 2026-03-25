import type { ReactNode } from "react";

import { ShopShell } from "@/components/shop/shop-shell";

type ShopSectionLayoutProps = {
  children: ReactNode;
};

export default function ShopSectionLayout({ children }: ShopSectionLayoutProps) {
  return <ShopShell>{children}</ShopShell>;
}
