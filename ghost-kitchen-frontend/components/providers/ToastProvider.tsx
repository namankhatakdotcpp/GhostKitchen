"use client";

import { Toaster } from "react-hot-toast";

/**
 * Toast Provider Component
 * 
 * Provides toast notification functionality across the app
 * Configured for:
 * - Success notifications (green)
 * - Error notifications (red)
 * - Info notifications (blue)
 * - Loading states
 * 
 * Usage:
 * 
 * import toast from 'react-hot-toast';
 * 
 * toast.success("Order placed successfully!");
 * toast.error("Payment failed. Please try again.");
 * toast.loading("Processing...");
 * 
 * const loadingToast = toast.loading("Loading...");
 * // Later...
 * toast.success("Done!", { id: loadingToast });
 */
export default function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      reverseOrder={false}
      gutter={8}
      toastOptions={{
        // Default options
        duration: 4000,
        style: {
          background: "#363636",
          color: "#fff",
          borderRadius: "8px",
          padding: "16px",
          fontSize: "14px",
          fontWeight: "500",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        },
        
        // Default options for specific types
        success: {
          duration: 3000,
          style: {
            background: "#10b981",
            color: "white",
          },
          iconTheme: {
            primary: "white",
            secondary: "#10b981",
          },
        },
        
        error: {
          duration: 4000,
          style: {
            background: "#ef4444",
            color: "white",
          },
          iconTheme: {
            primary: "white",
            secondary: "#ef4444",
          },
        },
        
        loading: {
          duration: Infinity, // Don't auto-dismiss
          style: {
            background: "#3b82f6",
            color: "white",
          },
          iconTheme: {
            primary: "white",
            secondary: "#3b82f6",
          },
        },
      }}
    />
  );
}
