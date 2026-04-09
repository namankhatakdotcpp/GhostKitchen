"use client";

/**
 * Real-Time Order Tracking Component
 * 
 * Displays live order status with Socket.IO updates
 * Shows progress through order lifecycle: PENDING → CONFIRMED → PREPARING → OUT_FOR_DELIVERY → DELIVERED
 */

import { useEffect } from "react";
import { useOrderStore } from "@/store/orderStore";
import { useSocket } from "@/hooks/useSocket";
import { useAuthStore } from "@/store/authStore";

interface OrderTrackingProps {
  orderId: string;
}

const ORDER_STATUSES = [
  { status: "PENDING", label: "Order Placed", icon: "📋" },
  { status: "CONFIRMED", label: "Confirmed", icon: "✅" },
  { status: "PREPARING", label: "Preparing", icon: "👨‍🍳" },
  { status: "OUT_FOR_DELIVERY", label: "Out for Delivery", icon: "🚴" },
  { status: "DELIVERED", label: "Delivered", icon: "🏠" },
];

export function OrderTracking({ orderId }: OrderTrackingProps) {
  const { selectedOrder, fetchOrderById } = useOrderStore();
  const { user } = useAuthStore();

  // Initialize real-time socket connection
  useSocket();

  // Fetch order on mount
  useEffect(() => {
    if (user && orderId) {
      fetchOrderById(orderId);
    }
  }, [orderId, user, fetchOrderById]);

  if (!selectedOrder) {
    return (
      <div className="p-6 bg-gray-50 rounded-lg border border-gray-200">
        <div className="text-center text-gray-500">Loading order...</div>
      </div>
    );
  }

  const currentStatusIndex = ORDER_STATUSES.findIndex(
    (s) => s.status === selectedOrder.status
  );

  return (
    <div className="space-y-6">
      {/* Order Header */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold mb-2">Order #{orderId.slice(0, 8)}</h2>
            <p className="text-gray-600">
              ₹{selectedOrder.totalAmount.toFixed(2)} •{" "}
              {selectedOrder.orderItems.length} items
            </p>
          </div>
          <div
            className={`px-4 py-2 rounded-full font-semibold ${
              selectedOrder.paymentStatus === "SUCCESS"
                ? "bg-green-100 text-green-800"
                : selectedOrder.paymentStatus === "FAILED"
                  ? "bg-red-100 text-red-800"
                  : "bg-yellow-100 text-yellow-800"
            }`}
          >
            {selectedOrder.paymentStatus === "SUCCESS" ? "✅ Paid" : selectedOrder.paymentStatus}
          </div>
        </div>
      </div>

      {/* Progress Timeline */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="font-bold text-lg mb-6">Order Status</h3>

        <div className="flex gap-2">
          {ORDER_STATUSES.map((item, index) => {
            const isCompleted = index <= currentStatusIndex;
            const isCurrent = index === currentStatusIndex;

            return (
              <div key={item.status} className="flex items-center flex-1">
                {/* Status Circle */}
                <div
                  className={`
                    flex items-center justify-center w-12 h-12 rounded-full font-bold text-xl
                    ${
                      isCompleted
                        ? "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-500"
                    }
                    ${isCurrent ? "ring-2 ring-green-500 ring-offset-2" : ""}
                  `}
                >
                  {item.icon}
                </div>

                {/* Connector Line */}
                {index < ORDER_STATUSES.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      index < currentStatusIndex
                        ? "bg-green-500"
                        : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Status Labels */}
        <div className="grid grid-cols-5 gap-2 mt-4">
          {ORDER_STATUSES.map((item) => (
            <div key={item.status} className="text-center text-sm">
              <p className="font-medium text-gray-900">{item.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Order Items */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h3 className="font-bold text-lg mb-4">Order Items</h3>
        <div className="space-y-3">
          {selectedOrder.orderItems.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center py-2 border-b border-gray-100"
            >
              <div>
                <p className="font-medium">{item.menuItem.name}</p>
                <p className="text-gray-600 text-sm">Qty: {item.quantity}</p>
              </div>
              <p className="font-semibold">₹{(item.price * item.quantity).toFixed(2)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Total */}
      <div className="bg-gradient-to-r from-green-50 to-green-100 p-6 rounded-lg border border-green-200">
        <div className="flex justify-between items-center">
          <p className="text-lg font-semibold text-gray-900">Order Total</p>
          <p className="text-3xl font-bold text-green-600">
            ₹{selectedOrder.totalAmount.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Status Information */}
      <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-800">
          <span className="font-semibold">Status Update:</span>
          {selectedOrder.status === "PENDING"
            ? " Your order is pending. Please complete payment to confirm."
            : selectedOrder.status === "CONFIRMED"
              ? " Your order is confirmed! Kitchen is preparing your food."
              : selectedOrder.status === "PREPARING"
                ? " Your food is being prepared. It will be out for delivery soon."
                : selectedOrder.status === "OUT_FOR_DELIVERY"
                  ? " Your order is on the way! 🚴"
                  : " Your order has been delivered. Enjoy!"}
        </p>
      </div>
    </div>
  );
}

/**
 * Status Progress Component
 * Reusable component for showing order progress in list views
 */
export function OrderStatusProgress({ status }: { status: string }) {
  const currentIndex = ORDER_STATUSES.findIndex((s) => s.status === status);

  return (
    <div className="flex gap-1">
      {ORDER_STATUSES.map((item, index) => (
        <div
          key={item.status}
          className={`h-1 flex-1 rounded-full ${
            index <= currentIndex ? "bg-green-500" : "bg-gray-300"
          }`}
        />
      ))}
    </div>
  );
}
