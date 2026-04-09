"use client";

import { useState } from "react";
import { retryPayment, openCashfreePaymentUI } from "@/lib/paymentApi";
import Link from "next/link";

interface PaymentFailureAlertProps {
  orderId: string;
  orderAmount?: number;
  onRetrySuccess?: () => void;
}

/**
 * Payment Failure Alert Component
 * 
 * Shows when an order's payment has failed
 * Offers retry button to allow customer to pay again
 */
export function PaymentFailureAlert({
  orderId,
  orderAmount,
  onRetrySuccess,
}: PaymentFailureAlertProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetryPayment = async () => {
    try {
      setIsRetrying(true);
      const session = await retryPayment(orderId);
      
      // Open Cashfree payment UI
      openCashfreePaymentUI(session.payment_session_id);
      
      onRetrySuccess?.();
    } catch (error) {
      console.error("Retry payment failed:", error);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="bg-red-50 border-l-4 border-red-500 p-6 mb-6 rounded-lg">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4v2m0 4v2M7 10a5 5 0 1110 0 5 5 0 01-10 0z"
              />
            </svg>
          </div>
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-bold text-red-800 mb-1">
            Payment Failed
          </h3>
          <p className="text-red-700 mb-4">
            Your payment could not be processed. Your order is waiting for
            payment. You can retry the payment or contact support for help.
          </p>

          {orderAmount && (
            <p className="text-red-700 font-semibold mb-4">
              Amount due: ₹{orderAmount.toFixed(2)}
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleRetryPayment}
              disabled={isRetrying}
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-bold py-2 px-6 rounded-lg transition-colors"
            >
              {isRetrying ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Retry Payment</span>
                </>
              )}
            </button>

            <Link
              href="/customer/support"
              className="inline-flex items-center bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2 px-6 rounded-lg transition-colors"
            >
              Contact Support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PaymentFailureAlert;
