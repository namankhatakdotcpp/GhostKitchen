"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Clock, CheckCircle, Truck, AlertCircle } from "lucide-react";
import ReviewForm from "@/components/customer/ReviewForm";

interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  menuItem: {
    name: string;
    price: number;
  };
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  paymentStatus: string;
  createdAt: string;
  orderItems: OrderItem[];
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [reviewingOrder, setReviewingOrder] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await api.get("/orders");
      setOrders(response.data);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "PENDING":
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case "CONFIRMED":
        return <CheckCircle className="h-5 w-5 text-blue-500" />;
      case "PREPARING":
        return <Clock className="h-5 w-5 text-orange-500" />;
      case "OUT_FOR_DELIVERY":
        return <Truck className="h-5 w-5 text-purple-500" />;
      case "DELIVERED":
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case "CANCELLED":
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Clock className="h-5 w-5" />;
    }
  };

  const getStatusText = (status: string) => {
    return status
      .split("_")
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Loading your orders...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Orders</h1>
        <p className="text-gray-600 mb-8">Track your deliveries and leave reviews</p>

        {orders.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">No orders yet</p>
            <a
              href="/restaurants"
              className="inline-block px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
            >
              Start Ordering
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg shadow overflow-hidden">
                {/* Order Header */}
                <button
                  onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                  className="w-full p-4 border-b border-gray-200 hover:bg-gray-50 transition text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      {getStatusIcon(order.status)}
                      <div>
                        <p className="font-semibold text-gray-900">
                          Order #{order.id.slice(0, 8)}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(order.createdAt).toLocaleDateString()} •{" "}
                          {getStatusText(order.status)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">₹{order.totalAmount.toFixed(2)}</p>
                      <p className="text-xs text-gray-600">
                        {order.paymentStatus === "SUCCESS" ? "Paid" : "Pending"}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Order Details */}
                {expandedOrder === order.id && (
                  <div className="p-4 space-y-4 bg-gray-50">
                    {/* Items */}
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">Items</h3>
                      <div className="space-y-2">
                        {order.orderItems.map((item) => (
                          <div key={item.id} className="flex justify-between text-sm">
                            <div>
                              <p className="text-gray-900">{item.menuItem.name}</p>
                              <p className="text-gray-600">Qty: {item.quantity}</p>
                            </div>
                            <p className="text-gray-900 font-semibold">₹{(item.price * item.quantity).toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Review Section (only for delivered orders) */}
                    {order.status === "DELIVERED" && !reviewingOrder && (
                      <button
                        onClick={() => setReviewingOrder(order.id)}
                        className="w-full py-2 px-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 font-medium transition"
                      >
                        Leave a Review
                      </button>
                    )}

                    {reviewingOrder === order.id && (
                      <ReviewForm
                        orderId={order.id}
                        onReviewSubmitted={() => {
                          setReviewingOrder(null);
                          fetchOrders();
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
