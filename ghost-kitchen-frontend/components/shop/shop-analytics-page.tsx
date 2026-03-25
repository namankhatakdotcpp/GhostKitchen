"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Clock3, Repeat2, ShoppingBag } from "lucide-react";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getShopAnalyticsData } from "@/lib/opsData";

const rangeOptions = ["Today", "Week", "Month", "Custom"] as const;
const pieColors = ["#FF5200", "#F4A000", "#1BA672", "#2E6BFF", "#7C4DFF"];

export function ShopAnalyticsPage() {
  const [range, setRange] = useState<(typeof rangeOptions)[number]>("Week");

  const analyticsQuery = useQuery({
    queryKey: ["shop-analytics", range],
    queryFn: getShopAnalyticsData,
  });

  const data = analyticsQuery.data;

  return (
    <div className="min-h-screen bg-white p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-text-muted">
              Analytics
            </p>
            <h1 className="mt-2 text-3xl font-bold text-text-primary">Performance</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Orders, revenue, item mix, and repeat behavior at a glance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {rangeOptions.map((option) => (
              <button
                className={`rounded-pill border px-3 py-2 text-sm font-medium ${
                  range === option
                    ? "border-brand bg-brand-light text-brand"
                    : "border-border text-text-secondary"
                }`}
                key={option}
                onClick={() => setRange(option)}
                type="button"
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {analyticsQuery.isLoading ? (
          <div className="grid gap-4">
            <div className="bone-loader h-36 rounded-[20px]" />
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="bone-loader h-[320px] rounded-[20px]" />
              <div className="bone-loader h-[320px] rounded-[20px]" />
            </div>
            <div className="bone-loader h-[320px] rounded-[20px]" />
          </div>
        ) : analyticsQuery.isError || !data ? (
          <div className="rounded-[20px] border border-border bg-white p-8 text-center">
            <p className="text-lg font-bold text-text-primary">Could not load analytics</p>
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              {[
                {
                  label: "Avg order value",
                  value: `₹${data.keyMetrics.avgOrderValue}`,
                  icon: ShoppingBag,
                },
                {
                  label: "Peak ordering hour",
                  value: data.keyMetrics.peakOrderingHour,
                  icon: Clock3,
                },
                {
                  label: "Repeat customer rate",
                  value: data.keyMetrics.repeatCustomerRate,
                  icon: Repeat2,
                },
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <div className="rounded-[18px] border border-border bg-[#FAFAFA] p-5" key={metric.label}>
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-light text-brand">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm text-text-muted">{metric.label}</p>
                    <p className="mt-2 text-2xl font-bold text-text-primary">{metric.value}</p>
                  </div>
                );
              })}
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[20px] border border-border bg-white p-5">
                <div className="flex items-center gap-3">
                  <BarChart3 className="h-5 w-5 text-brand" />
                  <h2 className="text-lg font-bold text-text-primary">Orders over time</h2>
                </div>
                <div className="mt-5 h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.timeline}>
                      <CartesianGrid stroke="#EEEEEE" strokeDasharray="3 3" />
                      <XAxis dataKey="label" stroke="#93959F" />
                      <YAxis stroke="#93959F" />
                      <Tooltip />
                      <Line dataKey="orders" stroke="#FF5200" strokeWidth={3} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-[20px] border border-border bg-white p-5">
                <h2 className="text-lg font-bold text-text-primary">Revenue by day</h2>
                <div className="mt-5 h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.timeline}>
                      <CartesianGrid stroke="#EEEEEE" strokeDasharray="3 3" />
                      <XAxis dataKey="label" stroke="#93959F" />
                      <YAxis stroke="#93959F" />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#FF5200" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            <section className="rounded-[20px] border border-border bg-white p-5">
              <h2 className="text-lg font-bold text-text-primary">Top items by quantity sold</h2>
              <div className="mt-5 h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip />
                    <Pie data={data.topItems} dataKey="value" nameKey="name" innerRadius={70} outerRadius={110}>
                      {data.topItems.map((entry, index) => (
                        <Cell fill={pieColors[index % pieColors.length]} key={entry.name} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {data.topItems.map((item, index) => (
                  <div className="rounded-[14px] border border-border px-3 py-2" key={item.name}>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: pieColors[index % pieColors.length] }}
                      />
                      <span className="text-sm font-semibold text-text-primary">{item.name}</span>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">{item.value} sold</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
