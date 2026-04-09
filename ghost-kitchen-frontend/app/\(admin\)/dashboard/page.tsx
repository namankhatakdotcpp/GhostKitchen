"use client";

/**
 * Admin Dashboard
 * 
 * Main admin panel for:
 * - Viewing all orders system-wide
 * - Managing order statuses
 * - Viewing statistics
 * - System monitoring
 * 
 * Requires: ADMIN role
 */

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useRouter } from "next/navigation";
import axiosInstance from "@/lib/api";
import OrdersTable from "@/components/admin/OrdersTable";
import AdminStats from "@/components/admin/AdminStats";
import { useSocketStatus } from "@/hooks/useSocket";
import { Skeleton, Spinner } from "@/components/ui/Skeleton";

export default function AdminDashboard() {
  const { user } = useAuthStore();
  const router = useRouter();
  const { isConnected } = useSocketStatus();
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("ALL");

  // Auth check
  useEffect(() => {
    if (user && user.role !== "ADMIN") {
      router.push("/");
    }
  }, [user, router]);

  // Fetch orders and stats
  useEffect(() => {
    if (!user || user.role !== "ADMIN") return;

    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [ordersRes, statsRes] = await Promise.all([
        axiosInstance.get("/admin/orders"),
        axiosInstance.get("/admin/stats"),
      ]);

      setOrders(ordersRes.data.data || []);
      setStats(statsRes.data.data || null);
    } catch (err: any) {
      const message = err.response?.data?.message || "Failed to load dashboard";
      setError(message);
      console.error("Dashboard error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchData();
  };

  const getFilteredOrders = () => {
    if (filter === "ALL") return orders;
    return orders.filter((order) => order.status === filter);
  };

  if (!user || user.role !== "ADMIN") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
          <p>You need admin privileges to access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-700 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
              <p className="text-slate-400 mt-2">System-wide order management</p>
            </div>
            <div className="flex items-center gap-4">
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                  isConnected
                    ? "bg-green-500/20 text-green-400"
                    : "bg-yellow-500/20 text-yellow-400"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    isConnected ? "bg-green-400" : "bg-yellow-400"
                  }`}
                />
                {isConnected ? "Real-time Connected" : "Using Fallback Polling"}
              </div>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                ↻ Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Statistics */}
        {stats ? (
          <AdminStats stats={stats} />
        ) : isLoading ? (
          <div className="grid grid-cols-4 gap-4 mb-8">
            <Skeleton />
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </div>
        ) : null}

        {/* Filter */}
        <div className="mb-6">
          <div className="flex gap-2 flex-wrap">
            {["ALL", "PENDING", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].map(
              (status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={`px-4 py-2 rounded-lg transition ${
                    filter === status
                      ? "bg-blue-600 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  {status}
                </button>
              )
            )}
          </div>
          <p className="text-slate-400 text-sm mt-2">
            Showing {getFilteredOrders().length} orders
          </p>
        </div>

        {/* Orders Table */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} />
            ))}
          </div>
        ) : orders.length > 0 ? (
          <OrdersTable orders={getFilteredOrders()} onRefresh={handleRefresh} />
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-400">No orders found</p>
          </div>
        )}
      </div>
    </div>
  );
}
