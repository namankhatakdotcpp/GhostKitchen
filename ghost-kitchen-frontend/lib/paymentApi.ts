import api from "@/lib/api";

/**
 * Payment API Client
 * Handles payment-related API calls
 * 
 * Note: Uses native alerts for error handling
 * For better UX, integrate with a toast library (react-hot-toast, etc.)
 */

// Helper to show notifications
const showNotification = {
  error: (message: string) => {
    console.error("Payment Error:", message);
    // Use browser alert as fallback
    if (typeof window !== "undefined") {
      alert(`❌ ${message}`);
    }
  },
  success: (message: string) => {
    console.log("Payment Success:", message);
    if (typeof window !== "undefined") {
      alert(`✅ ${message}`);
    }
  },
};

export interface PaymentSession {
  order_id: string;
  payment_session_id: string;
  amount: number;
  currency: string;
}

/**
 * Create payment session for an order
 */
export async function createPaymentSession(
  orderId: string
): Promise<PaymentSession> {
  try {
    const response = await api.post("/payments/create-session", { orderId });
    return response.data.data;
  } catch (error: any) {
    const message = error.error?.message || "Failed to create payment session";
    showNotification.error(message);
    throw error;
  }
}

/**
 * Verify payment status for an order
 */
export async function verifyPaymentStatus(orderId: string) {
  try {
    const response = await api.get(`/payments/verify/${orderId}`);
    return response.data.data;
  } catch (error: any) {
    console.error("Failed to verify payment:", error);
    throw error;
  }
}

/**
 * Retry payment for a failed order
 */
export async function retryPayment(
  orderId: string
): Promise<PaymentSession> {
  try {
    const response = await api.post(`/payments/retry/${orderId}`);
    showNotification.success("Payment session created. Please complete the payment.");
    return response.data.data;
  } catch (error: any) {
    const message = error.error?.message || "Failed to retry payment";
    showNotification.error(message);
    throw error;
  }
}

/**
 * Open Cashfree payment UI
 */
export function openCashfreePaymentUI(paymentSessionId: string) {
  // Cashfree checkout SDK
  const script = document.createElement("script");
  script.src = "https://sdk.cashfree.com/js/core/3.0.0/cashfree.prod.min.js";
  document.body.appendChild(script);

  script.onload = () => {
    const Cashfree = (window as any).Cashfree;
    Cashfree.IframeWidgetModal.open({
      sessionId: paymentSessionId,
      onSuccess: (data: any) => {
        console.log("Payment successful:", data);
        // Redirect will happen automatically
      },
      onFailure: (data: any) => {
        console.error("Payment failed:", data);
        showNotification.error("Payment failed. Please try again.");
      },
      onClose: () => {
        console.log("Payment UI closed");
      },
    });
  };
}

export default {
  createPaymentSession,
  verifyPaymentStatus,
  retryPayment,
  openCashfreePaymentUI,
};
