"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, hasHydrated, getCurrentUser } = useAuthStore();

  useEffect(() => {
    // Only validate the session cookie if the store thinks we're authenticated.
    // This prevents hitting /auth/me on every page load for logged-out users.
    if (hasHydrated && isAuthenticated) {
      getCurrentUser().catch(() => {});
    }
  // Run once after hydration completes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  return <>{children}</>;
}
