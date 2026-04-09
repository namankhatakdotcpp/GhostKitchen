"use client";

/**
 * Admin Statistics Cards
 * 
 * Displays KPI metrics for admin dashboard
 */

interface AdminStatsProps {
  stats: {
    totalOrders: number;
    todayOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    totalRevenue: number;
    successRate: string;
  };
}

export default function AdminStats({ stats }: AdminStatsProps) {
  const { totalOrders, todayOrders, completedOrders, cancelledOrders, totalRevenue, successRate } = stats;

  const StatCard = ({
    label,
    value,
    subtitle,
    color = "blue",
  }: {
    label: string;
    value: string | number;
    subtitle?: string;
    color?: string;
  }) => {
    const colorClasses: { [key: string]: string } = {
      blue: "from-blue-500/20 to-blue-600/20 border-blue-500/30",
      green: "from-green-500/20 to-green-600/20 border-green-500/30",
      purple: "from-purple-500/20 to-purple-600/20 border-purple-500/30",
      orange: "from-orange-500/20 to-orange-600/20 border-orange-500/30",
    };

    return (
      <div
        className={`bg-gradient-to-br ${colorClasses[color]} border rounded-lg p-6`}
      >
        <p className="text-slate-300 text-sm font-medium mb-2">{label}</p>
        <p className="text-3xl font-bold text-white">{value}</p>
        {subtitle && <p className="text-slate-400 text-xs mt-2">{subtitle}</p>}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      <StatCard
        label="Total Orders"
        value={totalOrders}
        subtitle="All-time orders"
        color="blue"
      />
      <StatCard
        label="Today's Orders"
        value={todayOrders}
        subtitle="Orders placed today"
        color="purple"
      />
      <StatCard
        label="Completed Orders"
        value={completedOrders}
        subtitle={`Success rate: ${successRate}%`}
        color="green"
      />
      <StatCard
        label="Total Revenue"
        value={`₹${(totalRevenue / 100000).toFixed(1)}L`}
        subtitle="Cumulative revenue"
        color="orange"
      />
    </div>
  );
}
