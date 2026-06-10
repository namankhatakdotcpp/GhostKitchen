"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useConfigStore } from "@/store/configStore";

function formatCountdown(ms: number) {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export default function MaintenancePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { config, loaded } = useConfigStore();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!loaded) return;
    if (!config.maintenanceMode && !config.maintenanceScheduledAt) router.replace("/");
    if (user?.roles?.includes("ADMIN")) router.replace("/admin/dashboard");
  }, [config, loaded, user, router]);

  // Tick every second for countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const reason = config.maintenanceReason;
  const isScheduled = !config.maintenanceMode && !!config.maintenanceScheduledAt;
  const scheduledAt = config.maintenanceScheduledAt ? new Date(config.maintenanceScheduledAt) : null;
  const endsAt = config.maintenanceEndsAt ? new Date(config.maintenanceEndsAt) : null;

  const msUntilStart = scheduledAt ? scheduledAt.getTime() - now : 0;
  const msUntilEnd = endsAt ? endsAt.getTime() - now : 0;

  return (
    <div className="min-h-screen bg-[#0C0C0E] flex flex-col items-center justify-center text-center px-6">
      <div className="mb-8">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-[#FF5200]/10 border border-[#FF5200]/20 flex items-center justify-center text-4xl mb-6">
          🔧
        </div>
        <h1 className="text-4xl font-black text-white mb-3">
          {isScheduled ? "Maintenance Scheduled" : "Under Maintenance"}
        </h1>
        <p className="text-[#9CA3AF] text-lg max-w-sm">
          {reason ||
            (isScheduled
              ? "GhostKitchen will be undergoing scheduled maintenance soon."
              : "GhostKitchen is currently undergoing maintenance. We'll be back shortly.")}
        </p>
      </div>

      {/* Main status card */}
      <div className="rounded-2xl border border-[#1F1F23] bg-[#111115] px-8 py-6 text-left max-w-sm w-full space-y-4 mb-4">
        <div className="flex items-center gap-3">
          <span
            className={`h-2 w-2 rounded-full ${isScheduled ? "bg-blue-400" : "bg-yellow-400 animate-pulse"}`}
          />
          <span className="text-sm font-semibold text-white">
            {isScheduled ? "Upcoming maintenance" : "Maintenance in progress"}
          </span>
        </div>

        {reason && (
          <div className="ml-5 rounded-xl border border-[#2A2A2E] bg-[#18181B] px-4 py-3">
            <p className="text-xs text-[#9CA3AF] font-medium mb-1">Reason</p>
            <p className="text-sm font-semibold text-[#D1D5DB]">{reason}</p>
          </div>
        )}

        {scheduledAt && (
          <div className="ml-5 rounded-xl border border-[#2A2A2E] bg-[#18181B] px-4 py-3">
            <p className="text-xs text-[#9CA3AF] font-medium mb-1">Starts at</p>
            <p className="text-sm font-semibold text-[#D1D5DB]">{formatDateTime(scheduledAt.toISOString())}</p>
          </div>
        )}

        {endsAt && (
          <div className="ml-5 rounded-xl border border-[#2A2A2E] bg-[#18181B] px-4 py-3">
            <p className="text-xs text-[#9CA3AF] font-medium mb-1">Expected completion</p>
            <p className="text-sm font-semibold text-[#D1D5DB]">{formatDateTime(endsAt.toISOString())}</p>
          </div>
        )}

        {!isScheduled && (
          <p className="text-xs text-[#6B7280] ml-5">Platform services are temporarily unavailable</p>
        )}
      </div>

      {/* Countdown */}
      {isScheduled && msUntilStart > 0 && (
        <div className="rounded-2xl border border-blue-900/40 bg-blue-950/20 px-8 py-5 max-w-sm w-full text-center mb-4">
          <p className="text-xs text-blue-400 font-semibold uppercase tracking-wider mb-2">
            Starts in
          </p>
          <p className="text-4xl font-mono font-black text-blue-300 tabular-nums">
            {formatCountdown(msUntilStart)}
          </p>
        </div>
      )}

      {!isScheduled && endsAt && msUntilEnd > 0 && (
        <div className="rounded-2xl border border-yellow-900/40 bg-yellow-950/20 px-8 py-5 max-w-sm w-full text-center mb-4">
          <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wider mb-2">
            Expected back in
          </p>
          <p className="text-4xl font-mono font-black text-yellow-300 tabular-nums">
            {formatCountdown(msUntilEnd)}
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-[#4B5563]">GhostKitchen &copy; {new Date().getFullYear()}</p>
    </div>
  );
}
