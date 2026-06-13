"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so the map must be client-only (no SSR).
const AdminLiveOperationsMap = dynamic(
  () => import("@/components/admin/AdminLiveOperationsMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[60vh] items-center justify-center text-sm text-text-muted">
        Loading operations map…
      </div>
    ),
  },
);

export default function AdminLiveMapPage() {
  return <AdminLiveOperationsMap />;
}
