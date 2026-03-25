import type { ReactNode } from "react";

import { CustomerChrome } from "@/components/customer/customer-chrome";

type CustomerLayoutProps = {
  children: ReactNode;
};

export default function CustomerLayout({ children }: CustomerLayoutProps) {
  return <CustomerChrome>{children}</CustomerChrome>;
}
