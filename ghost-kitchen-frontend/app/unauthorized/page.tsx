"use client";

import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-[#0C0C0E] flex flex-col items-center justify-center text-center px-6">
      <div className="mb-8">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-4xl mb-6">
          🚫
        </div>
        <h1 className="text-5xl font-black text-white mb-2">403</h1>
        <h2 className="text-2xl font-bold text-[#D1D5DB] mb-3">Access Denied</h2>
        <p className="text-[#9CA3AF] text-base max-w-sm">
          You don&apos;t have permission to view this page. If you think this is a
          mistake, contact your administrator.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-xl bg-[#FF5200] px-6 py-3 text-sm font-semibold text-white hover:bg-[#e04800] transition-colors"
      >
        ← Go Home
      </Link>

      <p className="mt-8 text-xs text-[#4B5563]">
        GhostKitchen &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
