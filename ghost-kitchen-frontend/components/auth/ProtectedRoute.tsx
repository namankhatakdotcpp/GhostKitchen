/**
 * Protected Route Wrapper
 * 
 * Checks authentication status and redirects to login if needed
 * Shows loading state while verifying auth
 * 
 * Usage:
 * <ProtectedRoute>
 *   <YourComponent />
 * </ProtectedRoute>
 */

"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: string[];
}

export const ProtectedRoute = ({
  children,
  requiredRole,
}: ProtectedRouteProps) => {
  const router = useRouter();
  const { isAuthenticated, user, isLoading } = useAuthStore();

  useEffect(() => {
    // Skip check if still loading
    if (isLoading) return;

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    // Check role if required
    if (requiredRole && user && !requiredRole.includes(user.role)) {
      router.push("/unauthorized");
    }
  }, [isAuthenticated, isLoading, user, requiredRole, router]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Render protected content
  return <>{children}</>;
};

export default ProtectedRoute;
