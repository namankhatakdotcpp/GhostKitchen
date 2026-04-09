/**
 * Auth Provider Component
 * 
 * Wraps the app to:
 * - Initialize auth store from localStorage on mount
 * - Validate session on app load
 * - Handle token refresh logic
 * - Provide auth state to all child components
 */

"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, getCurrentUser } = useAuthStore();

  useEffect(() => {
    // If user is logged in, verify the session is still valid
    if (isAuthenticated) {
      getCurrentUser().catch(() => {
        // Session invalid, will be handled by auth store
      });
    }
  }, [isAuthenticated, getCurrentUser]);

  return <>{children}</>;
}
