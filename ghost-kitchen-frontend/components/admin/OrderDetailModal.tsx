"use client";

/**
 * Order Detail Modal
 * 
 * Shows complete order details in a modal
 */

import { useState } from "react";
import axiosInstance from "@/lib/api";
import { formatDate, formatCurrency } from "@/lib/utils";

const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

interface OrderDetailModalProps {
  order: any;
  onClose: () => void;
  onStatusUpdated: () => void;
}

export default function OrderDetailModal({
  order,
  onClose,
  onStatusUpdated,
}: OrderDetailModalProps) {
  const [selectedStatus, setSelectedStatus] = useState(order.status);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStatusUpdate = async () => {
    if (selectedStatus === order.status) {
      onClose();
      return;
    }

    try {
      setIsUpdating(true);
      setError(null);

      await axiosInstance.patch(`/admin/orders/${order.id}/status`, {
        status: selectedStatus,
        reason: "Admin updated via modal",
      });

      onStatusUpdated();
      onClose();
    } catch (err: any) {
      const message = err.response?.data?.message || "Failed to update status";
      setError(message);
      console.error("Status update error:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 px-6 py-4 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Order Details</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-2xl transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Order ID and Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-slate-400 text-sm">Order ID</p>
              <p className="text-white font-mono font-semibold">{order.id}</p>
            </div>
            <div>
              <p className="text-slate-400 text-sm">Date</p>
              <p className="text-white">{formatDate(order.createdAt)}</p>
            </div>
          </div>

          {/* Customer Info */}
          <div className="border-t border-slate-700 pt-4">
            <h3 className="text-lg font-bold text-white mb-3">Customer</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-slate-400 text-sm">Name</p>
                <p className="text-white">{order.user?.name || "Unknown"}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Email</p>
                <p className="text-white text-sm">{order.user?.email || "—"}</p>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Phone</p>
                <p className="text-white">{order.user?.phone || "—"}</p>
              </div>
            </div>
          </div>

          {/* Restaurant Info */}
          <div className="border-t border-slate-700 pt-4">
            <h3 className="text-lg font-bold text-white mb-3">Restaurant</h3>
            <div>
              <p className="text-slate-400 text-sm">Name</p>
              <p className="text-white">{order.restaurant?.name || "Unknown"}</p>
            </div>
          </div>

          {/* Order Items */}
          <div className="border-t border-slate-700 pt-4">
            <h3 className="text-lg font-bold text-white mb-3">Items</h3>
            <div className="space-y-2">
              {order.orderItems?.map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between p-2 bg-slate-700/50 rounded">
                  <div>
                    <p className="text-white font-medium text-sm">
                      {item.menuItem?.name || "Unknown Item"}
                    </p>
                    <p className="text-slate-400 text-xs">× {item.quantity}</p>
                  </div>
                  <p className="text-green-400 font-semibold">₹{formatCurrency(item.price)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Amount Summary */}
          <div className="border-t border-slate-700 pt-4">
            <div className="flex justify-between mb-4">
              <p className="text-slate-200 font-semibold">Total Amount</p>
              <p className="text-green-400 text-2xl font-bold">₹{formatCurrency(order.totalAmount)}</p>
            </div>
            <div className="flex justify-between">
              <p className="text-slate-400 text-sm">Payment Status</p>
              <span
                className={`px-3 py-1 rounded text-sm font-medium ${
                  order.paymentStatus === "SUCCESS"
                    ? "bg-green-500/20 text-green-400"
                    : order.paymentStatus === "PENDING"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
                }`}
              >
                {order.paymentStatus}
              </span>
            </div>
          </div>

          {/* Status Update */}
          <div className="border-t border-slate-700 pt-4">
            <label className="block text-slate-200 font-semibold mb-3">Update Status</label>
            {error && (
              <div className="mb-3 p-3 bg-red-500/20 border border-red-500/50 rounded text-red-400 text-sm">
                {error}
              </div>
            )}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 text-white rounded px-4 py-2 mb-4"
            >
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <button
              onClick={handleStatusUpdate}
              disabled={isUpdating}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded transition disabled:opacity-50"
            >
              {isUpdating ? "Updating..." : "Update Status"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
