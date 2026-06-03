"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: string[];
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const router = useRouter();
  const { isAuthenticated, hasHydrated, user } = useAuthStore();

  useEffect(() => {
    // Wait for Zustand to rehydrate from localStorage before checking auth
    if (!hasHydrated) return;

    if (!isAuthenticated) {
      const returnUrl = encodeURIComponent(window.location.pathname);
      router.replace(`/login?returnUrl=${returnUrl}`);
      return;
    }

    if (requiredRole && user && !requiredRole.includes(user.activeRole)) {
      router.replace("/unauthorized");
    }
  }, [isAuthenticated, hasHydrated, user, requiredRole, router]);

  // Show spinner until Zustand has rehydrated from localStorage
  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-500" />
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
