import type { ReactNode } from "react";

import ProtectedRoute from "@/components/auth/ProtectedRoute";

type DeliveryLayoutProps = {
  children: ReactNode;
};

export default function DeliveryLayout({ children }: DeliveryLayoutProps) {
  return (
    <ProtectedRoute requiredRole={["DELIVERY", "ADMIN"]}>
      <div className="min-h-screen bg-surface">{children}</div>
    </ProtectedRoute>
  );
}
