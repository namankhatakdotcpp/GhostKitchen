"use client";

/**
 * Orders Table Component
 * 
 * Displays all orders in a sortable, filterable table
 * Allows admin to view and manage order details
 */

import { useState } from "react";
import StatusUpdater from "./StatusUpdater";
import OrderDetailModal from "./OrderDetailModal";
import { formatDate, formatCurrency } from "@/lib/utils";
import { OrderItem } from "@/types/index";

interface Order {
  id: string;
  userId: string;
  restaurantId: string;
  totalAmount?: number;
  total?: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  orderItems: OrderItem[];
  user?: any;
  restaurant?: any;
}

interface OrdersTableProps {
  orders: Order[];
  onRefresh: () => void;
}

export default function OrdersTable({ orders, onRefresh }: OrdersTableProps) {
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      PENDING: "bg-yellow-500/20 text-yellow-400",
      CONFIRMED: "bg-blue-500/20 text-blue-400",
      PREPARING: "bg-purple-500/20 text-purple-400",
      OUT_FOR_DELIVERY: "bg-orange-500/20 text-orange-400",
      DELIVERED: "bg-green-500/20 text-green-400",
      CANCELLED: "bg-red-500/20 text-red-400",
    };
    return colors[status] || "bg-slate-500/20 text-slate-400";
  };

  const getPaymentColor = (status: string) => {
    return status === "SUCCESS"
      ? "text-green-400"
      : status === "PENDING"
      ? "text-yellow-400"
      : "text-red-400";
  };

  const sortedOrders = [...orders].sort((a, b) => {
    if (sortBy === "date") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    } else {
      const amountA = a.totalAmount || a.total || 0;
      const amountB = b.totalAmount || b.total || 0;
      return amountB - amountA;
    }
  });

  return (
    <>
      <div className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden shadow-xl">
        {/* Table Controls */}
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Orders</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setSortBy("date")}
              className={`px-3 py-1 rounded text-sm transition ${
                sortBy === "date"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Sort by Date
            </button>
            <button
              onClick={() => setSortBy("amount")}
              className={`px-3 py-1 rounded text-sm transition ${
                sortBy === "amount"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
              }`}
            >
              Sort by Amount
            </button>
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50 border-b border-slate-600">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">Order ID</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">Customer</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">Restaurant</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-slate-200">Amount</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">Payment</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-slate-200">Date</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-slate-200">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {sortedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-700/30 transition">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedOrder(order)}
                      className="text-blue-400 hover:text-blue-300 underline text-sm font-mono"
                    >
                      {order.id.slice(0, 8)}...
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">
                      <p className="text-white font-medium">{order.user?.name || "Unknown"}</p>
                      <p className="text-slate-400 text-xs">{order.user?.email || "—"}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-200">{order.restaurant?.name || "Unknown"}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="text-sm font-mono font-semibold text-green-400">
                      ₹{formatCurrency(order.totalAmount || order.total || 0)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${getPaymentColor(order.paymentStatus)}`}>
                      {order.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-slate-400">{formatDate(order.createdAt)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusUpdater orderId={order.id} onRefresh={onRefresh} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          onStatusUpdated={onRefresh}
        />
      )}
    </>
  );
}
