"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { getCurrentUser } = useAuthStore();

  useEffect(() => {
    // Always try to restore session from HttpOnly cookie on app load.
    // If the cookie is valid, user stays logged in. If not, auth store clears.
    getCurrentUser().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}
