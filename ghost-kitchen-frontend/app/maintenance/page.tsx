"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useConfigStore } from "@/store/configStore";

export default function MaintenancePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { config, loaded } = useConfigStore();

  useEffect(() => {
    if (!loaded) return;
    if (!config.maintenanceMode) router.replace("/");
    if (user?.roles?.includes("ADMIN")) router.replace("/admin/dashboard");
  }, [config, loaded, user, router]);

  return (
    <div className="min-h-screen bg-[#0C0C0E] flex flex-col items-center justify-center text-center px-6">
      <div className="mb-8">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-[#FF5200]/10 border border-[#FF5200]/20 flex items-center justify-center text-4xl mb-6">
          🔧
        </div>
        <h1 className="text-4xl font-black text-white mb-3">Under Maintenance</h1>
        <p className="text-[#9CA3AF] text-lg max-w-sm">
          GhostKitchen is currently undergoing scheduled maintenance. We&apos;ll be back shortly.
        </p>
      </div>

      <div className="rounded-2xl border border-[#1F1F23] bg-[#111115] px-8 py-6 text-left max-w-sm w-full">
        <div className="flex items-center gap-3 mb-1">
          <span className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
          <span className="text-sm font-semibold text-white">Maintenance in progress</span>
        </div>
        <p className="text-xs text-[#6B7280] ml-5">Platform services are temporarily unavailable</p>
      </div>

      <p className="mt-8 text-xs text-[#4B5563]">GhostKitchen &copy; {new Date().getFullYear()}</p>
    </div>
  );
}
