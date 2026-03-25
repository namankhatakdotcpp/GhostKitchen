import { OrderTrackingPage } from "@/components/customer/order-tracking-page";

type OrderTrackPageProps = {
  params: {
    id: string;
  };
};

export default function OrderTrackPage({ params }: OrderTrackPageProps) {
  return <OrderTrackingPage orderId={params.id} />;
}
