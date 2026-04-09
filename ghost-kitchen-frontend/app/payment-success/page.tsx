"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useOrderStore } from "@/store/orderStore";

/**
 * Payment Success Page
 * 
 * Shown after successful payment
 * User is redirected here by Cashfree
 * 
 * URL: /payment-success?order_id={orderId}
 */

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");
  
  const { fetchOrderById, selectedOrder, isLoading } = useOrderStore();
  const [error, setError] = useState<string | null>(null);

  // Fetch order details on mount
  useEffect(() => {
    if (!orderId) {
      setError("No order ID provided");
      return;
    }

    fetchOrderById(orderId).catch((err) => {
      console.error("Failed to fetch order:", err);
      setError("Failed to load order details");
    });
  }, [orderId, fetchOrderById]);

  if (!orderId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Invalid Order
          </h1>
          <p className="text-gray-600 mb-6">
            No order ID found. Please try placing an order again.
          </p>
          <Link
            href="/customer/search"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-lg transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin text-orange-500 mb-4">
            <svg
              className="w-12 h-12 mx-auto"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <p className="text-gray-600">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (error || !selectedOrder) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Something went wrong
          </h1>
          <p className="text-gray-600 mb-2">{error}</p>
          <p className="text-sm text-gray-500 mb-6">
            Order ID: {orderId?.slice(0, 8).toUpperCase()}
          </p>
          <div className="space-y-2">
            <Link
              href={`/customer/orders/${orderId}`}
              className="block bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg transition-colors"
            >
              View Order
            </Link>
            <Link
              href="/customer/orders"
              className="block bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-8 rounded-lg transition-colors"
            >
              My Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Success Message */}
        <div className="text-center mb-8">
          <div className="inline-block bg-green-100 rounded-full p-4 mb-4">
            <div className="text-6xl">✅</div>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Payment Successful! 🎉
          </h1>
          <p className="text-xl text-gray-600">
            Your order has been confirmed
          </p>
        </div>

        {/* Order Details Card */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
          <div className="grid grid-cols-2 gap-4 mb-6 pb-6 border-b border-gray-200">
            <div>
              <p className="text-sm text-gray-600 mb-1">Order ID</p>
              <p className="text-lg font-mono font-bold text-gray-800">
                {selectedOrder.id.slice(0, 8).toUpperCase()}...
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Total Amount</p>
              <p className="text-lg font-bold text-green-600">
                ₹{selectedOrder.totalAmount.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Order Status</p>
              <p className="text-lg font-bold">
                <span className="inline-block bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                  {selectedOrder.status}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 mb-1">Items</p>
              <p className="text-lg font-bold text-gray-800">
                {selectedOrder.orderItems.length} item
                {selectedOrder.orderItems.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {/* Order Items */}
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              Your Items
            </h2>
            <div className="space-y-3">
              {selectedOrder.orderItems.map((item) => (
                <div key={item.id} className="flex justify-between items-center">
                  <div>
                    <p className="font-semibold text-gray-800">
                      {item.menuItem?.name || "Menu Item"}
                    </p>
                    <p className="text-sm text-gray-600">
                      Qty: {item.quantity} × ₹{item.price.toFixed(2)}
                    </p>
                  </div>
                  <p className="font-bold text-gray-800">
                    ₹{(item.quantity * item.price).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* What Happens Next */}
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <h3 className="font-bold text-blue-900 mb-3">What Happens Next?</h3>
            <ol className="text-sm text-blue-800 space-y-2">
              <li className="flex gap-2">
                <span className="font-bold">1.</span>
                <span>We've sent you a confirmation email</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">2.</span>
                <span>Restaurant starts preparing your food</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">3.</span>
                <span>We'll notify you when it's out for delivery</span>
              </li>
              <li className="flex gap-2">
                <span className="font-bold">4.</span>
                <span>Track your delivery in real-time</span>
              </li>
            </ol>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link
            href={`/customer/orders/${selectedOrder.id}`}
            className="block text-center bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-lg transition-colors"
          >
            Track Order
          </Link>
          <Link
            href="/customer/search"
            className="block text-center bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-3 px-8 rounded-lg transition-colors"
          >
            Order More
          </Link>
        </div>

        {/* Contact Support */}
        <div className="mt-8 text-center text-gray-600">
          <p className="mb-2">Questions? We're here to help!</p>
          <a
            href="mailto:support@ghostkitchen.com"
            className="text-orange-600 hover:text-orange-700 font-medium"
          >
            Contact Support
          </a>
        </div>
      </div>
    </div>
  );
}
