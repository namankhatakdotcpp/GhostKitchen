import type { ReactNode } from "react";

import { DeliveryShell } from "@/components/delivery/delivery-shell";

type DeliverySectionLayoutProps = {
  children: ReactNode;
};

export default function DeliverySectionLayout({
  children,
}: DeliverySectionLayoutProps) {
  return <DeliveryShell>{children}</DeliveryShell>;
}
