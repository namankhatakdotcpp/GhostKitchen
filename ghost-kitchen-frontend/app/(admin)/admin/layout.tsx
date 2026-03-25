import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin/admin-shell";

type AdminSectionLayoutProps = {
  children: ReactNode;
};

export default function AdminSectionLayout({ children }: AdminSectionLayoutProps) {
  return <AdminShell>{children}</AdminShell>;
}
