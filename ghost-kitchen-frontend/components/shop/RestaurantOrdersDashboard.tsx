"use client";

/**
 * Restaurant Orders Dashboard
 * Real-time incoming orders for restaurant staff
 */

import { useEffect } from "react";
import { useOrderStore } from "@/store/orderStore";
import { useRestaurantSocket } from "@/hooks/useSocket";
import { useAuthStore } from "@/store/authStore";

interface RestaurantOrdersDashboardProps {
  restaurantId: string;
}

export function RestaurantOrdersDashboard({
  restaurantId,
}: RestaurantOrdersDashboardProps) {
  const { orders } = useOrderStore();
  const { user } = useAuthStore();

  // Initialize real-time socket connection for restaurant
  useRestaurantSocket(restaurantId);

  // Filter orders for this restaurant and not yet delivered/cancelled
  const activeOrders = orders.filter(
    (order) =>
      order.restaurantId === restaurantId &&
      order.status !== "DELIVERED" &&
      order.status !== "CANCELLED"
  );

  const ordersByStatus = {
    PENDING: activeOrders.filter((o) => o.status === "PENDING"),
    CONFIRMED: activeOrders.filter((o) => o.status === "CONFIRMED"),
    PREPARING: activeOrders.filter((o) => o.status === "PREPARING"),
    OUT_FOR_DELIVERY: activeOrders.filter((o) => o.status === "OUT_FOR_DELIVERY"),
  };

  const statusConfig = {
    PENDING: { label: "New Orders", color: "bg-red-100 border-red-300", icon: "🔔" },
    CONFIRMED: {
      label: "Confirmed",
      color: "bg-yellow-100 border-yellow-300",
      icon: "✅",
    },
    PREPARING: { label: "Preparing", color: "bg-blue-100 border-blue-300", icon: "👨‍🍳" },
    OUT_FOR_DELIVERY: {
      label: "Out for Delivery",
      color: "bg-green-100 border-green-300",
      icon: "🚴",
    },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg border border-gray-200">
        <h2 className="text-3xl font-bold mb-2">🍽️ Orders Dashboard</h2>
        <p className="text-gray-600">
          Total active orders: <span className="font-bold text-2xl">{activeOrders.length}</span>
        </p>
      </div>

      {/* Status Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(statusConfig) as Array<keyof typeof statusConfig>).map(
          (status) => {
            const statusOrders = ordersByStatus[status as keyof typeof ordersByStatus];
            const config = statusConfig[status];

            return (
              <div
                key={status}
                className={`rounded-lg border-2 p-4 ${config.color}`}
              >
                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">{config.icon}</span>
                  <div>
                    <p className="font-bold text-lg">{config.label}</p>
                    <p className="text-sm font-semibold">
                      {statusOrders.length} {statusOrders.length === 1 ? "order" : "orders"}
                    </p>
                  </div>
                </div>

                {/* Orders List */}
                <div className="space-y-3">
                  {statusOrders.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="text-sm">No orders</p>
                    </div>
                  ) : (
                    statusOrders.map((order) => (
                      <div
                        key={order.id}
                        className="bg-white rounded-lg p-3 border-l-4 border-blue-500"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <p className="font-bold text-sm">
                            #{order.id.slice(0, 8)}
                          </p>
                          <p className="text-xs font-semibold text-gray-600">
                            {order.orderItems.length} items
                          </p>
                        </div>

                        {/* Items Preview */}
                        <div className="text-xs text-gray-700 mb-2">
                          {order.orderItems?.slice(0, 2).map((item) => (
                            <p key={item.id}>
                              • {item.quantity}x {item.menuItem?.name || "Item"}
                            </p>
                          ))}
                          {order.orderItems && order.orderItems.length > 2 && (
                            <p>• +{order.orderItems.length - 2} more</p>
                          )}
                        </div>

                        {/* Order Total */}
                        <p className="font-bold text-sm text-green-600">
                          ₹{order.totalAmount.toFixed(2)}
                        </p>

                        {/* Payment Status */}
                        <div className="mt-2 pt-2 border-t">
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded ${
                              order.paymentStatus === "SUCCESS"
                                ? "bg-green-200 text-green-800"
                                : "bg-yellow-200 text-yellow-800"
                            }`}
                          >
                            {order.paymentStatus === "SUCCESS"
                              ? "✅ Payment Done"
                              : "⏳ Awaiting Payment"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          }
        )}
      </div>

      {/* Sound Notification for New Orders (Optional) */}
      <NewOrderAlert activeOrdersCount={activeOrders.length} />
    </div>
  );
}

/**
 * Sound notification when new orders arrive
 */
function NewOrderAlert({ activeOrdersCount }: { activeOrdersCount: number }) {
  useEffect(() => {
    // Optional: Play sound when new orders arrive
    if (activeOrdersCount > 0) {
      // Could trigger audio notification here
      // playNotificationSound();
    }
  }, [activeOrdersCount]);

  return null;
}
