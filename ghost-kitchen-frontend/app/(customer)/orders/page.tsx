"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Clock, CheckCircle, Truck, AlertCircle, Package } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

interface OrderItemJSON {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

interface Order {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  placedAt: string;
  createdAt: string;
  items: OrderItemJSON[];
  restaurant?: {
    id: string;
    name: string;
    imageUrl?: string;
  };
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const response = await api.get("/orders");
      // Controller returns { orders: [...] }
      setOrders(response.data?.orders ?? response.data ?? []);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      toast.error("Failed to fetch orders. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "PLACED":
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
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Orders</h1>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-lg shadow p-4 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="h-5 w-5 bg-gray-300 rounded-full" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-300 rounded w-32 mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-48" />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="h-4 bg-gray-300 rounded w-24 mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Your Orders</h1>
        <p className="text-gray-600 mb-8">Track your deliveries</p>

        {orders.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">No orders yet</h2>
            <p className="text-gray-600 mb-6">
              Start ordering delicious food from your favorite restaurants
            </p>
            <a
              href="/"
              className="inline-block px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition font-medium"
            >
              Browse Restaurants
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div key={order.id} className="bg-white rounded-lg shadow overflow-hidden">
                <button
                  onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                  className="w-full p-4 border-b border-gray-200 hover:bg-gray-50 transition text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      {getStatusIcon(order.status)}
                      <div>
                        <p className="font-semibold text-gray-900">
                          {order.restaurant?.name ?? "Order"} #{order.id.slice(-6).toUpperCase()}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(order.placedAt ?? order.createdAt).toLocaleDateString()} •{" "}
                          {getStatusText(order.status)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">₹{order.total.toFixed(2)}</p>
                      <p className="text-xs text-gray-600">{order.items?.length ?? 0} items</p>
                    </div>
                  </div>
                </button>

                {expandedOrder === order.id && (
                  <div className="p-4 space-y-4 bg-gray-50">
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-3">Items</h3>
                      <div className="space-y-2">
                        {(order.items ?? []).map((item) => (
                          <div key={item.menuItemId} className="flex justify-between text-sm">
                            <div>
                              <p className="text-gray-900">{item.name}</p>
                              <p className="text-gray-600">Qty: {item.quantity}</p>
                            </div>
                            <p className="text-gray-900 font-semibold">
                              ₹{(item.price * item.quantity).toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t pt-3 text-sm space-y-1">
                      <div className="flex justify-between text-gray-600">
                        <span>Subtotal</span><span>₹{order.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Delivery fee</span><span>₹{order.deliveryFee.toFixed(2)}</span>
                      </div>
                      {order.discount > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Discount</span><span>-₹{order.discount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t">
                        <span>Total</span><span>₹{order.total.toFixed(2)}</span>
                      </div>
                    </div>

                    {["PLACED", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"].includes(order.status) && (
                      <Link
                        href={`/order/${order.id}/track`}
                        className="block w-full py-2 px-4 bg-orange-600 text-white rounded-lg text-center hover:bg-orange-700 font-medium transition"
                      >
                        Track Order
                      </Link>
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
