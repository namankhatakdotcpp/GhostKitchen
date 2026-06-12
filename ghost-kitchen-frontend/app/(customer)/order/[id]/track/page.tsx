"use client";

import { OrderTrackingPage } from "@/components/customer/order-tracking-page";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

type OrderTrackPageProps = {
  params: {
    id: string;
  };
};

export default function OrderTrackPage({ params }: OrderTrackPageProps) {
  return (
    <ProtectedRoute requiredRole={["CUSTOMER"]}>
      <OrderTrackingPage orderId={params.id} />
    </ProtectedRoute>
  );
}
