import type { ReactNode } from "react";

import ProtectedRoute from "@/components/auth/ProtectedRoute";

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <ProtectedRoute requiredRole={["ADMIN"]}>
      <div className="min-h-screen bg-surface">{children}</div>
    </ProtectedRoute>
  );
}
