"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * Payment return page (legacy Cashfree return_url).
 *
 * In the current checkout flow an Order record only exists once payment is
 * captured, so the old "did the payment fail?" UI here was dead weight built
 * on fields that no longer exist. Just hand off to live order tracking.
 */
function PaymentSuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");

  useEffect(() => {
    if (orderId) {
      router.replace(`/order/${orderId}/track`);
    }
  }, [orderId, router]);

  if (!orderId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Invalid Order</h1>
          <p className="text-gray-600 mb-6">
            No order ID found. Please try placing an order again.
          </p>
          <Link
            href="/"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-8 rounded-lg transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-500 mx-auto mb-4" />
        <p className="text-gray-600">Taking you to your order…</p>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={null}>
      <PaymentSuccessContent />
    </Suspense>
  );
}
