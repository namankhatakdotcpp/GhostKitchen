import { useOrderStore } from "../store/orderStore";

export default function OrderStatus() {
  const order = useOrderStore((s) => s.activeOrder);

  if (!order) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Order Confirmed 🎉</h2>
      <p className="text-sm text-gray-600">
        Status: Waiting for restaurant acceptance
      </p>
    </div>
  );
}
