"use client";

/**
 * Status Updater Component
 * 
 * Allows admin to quickly update order status from table
 */

import { useState } from "react";
import axiosInstance from "@/lib/api";

const ORDER_STATUSES = [
  { value: "PENDING", label: "⏳ Pending" },
  { value: "CONFIRMED", label: "✓ Confirmed" },
  { value: "PREPARING", label: "🍳 Preparing" },
  { value: "OUT_FOR_DELIVERY", label: "🚗 Out for Delivery" },
  { value: "DELIVERED", label: "✓✓ Delivered" },
  { value: "CANCELLED", label: "✕ Cancelled" },
];

interface StatusUpdaterProps {
  orderId: string;
  onRefresh: () => void;
}

export default function StatusUpdater({ orderId, onRefresh }: StatusUpdaterProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  const handleStatusUpdate = async (newStatus: string) => {
    try {
      setIsUpdating(true);
      setError(null);

      await axiosInstance.patch(`/admin/orders/${orderId}/status`, {
        status: newStatus,
        reason: "Admin updated status",
      });

      // Success - refresh data
      onRefresh();
      setShowMenu(false);
    } catch (err: any) {
      const message = err.response?.data?.message || "Failed to update status";
      setError(message);
      console.error("Status update error:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={isUpdating}
        className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition disabled:opacity-50"
      >
        {isUpdating ? "..." : "Update"}
      </button>

      {showMenu && (
        <div className="absolute right-0 mt-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 min-w-[200px]">
          {error && (
            <div className="px-3 py-2 bg-red-500/20 text-red-400 text-xs border-b border-slate-600">
              {error}
            </div>
          )}
          {ORDER_STATUSES.map((status) => (
            <button
              key={status.value}
              onClick={() => handleStatusUpdate(status.value)}
              className="w-full text-left px-4 py-2 hover:bg-slate-700 text-sm text-slate-200 transition border-b border-slate-700 last:border-none"
            >
              {status.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
