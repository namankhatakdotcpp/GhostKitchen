import type { ReactNode } from "react";

import ProtectedRoute from "@/components/auth/ProtectedRoute";

type ShopLayoutProps = {
  children: ReactNode;
};

export default function ShopLayout({ children }: ShopLayoutProps) {
  return (
    <ProtectedRoute requiredRole={["RESTAURANT", "ADMIN"]}>
      <div className="min-h-screen bg-surface">{children}</div>
    </ProtectedRoute>
  );
}
