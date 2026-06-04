"use client";

import { useEffect, useRef } from "react";
import { useAuthStore } from "@/store/authStore";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const called = useRef(false);

  useEffect(() => {
    // Run exactly once after Zustand has rehydrated from localStorage.
    // The ref guard prevents React StrictMode double-invocation from firing twice.
    const unsub = useAuthStore.subscribe(
      (state) => state.hasHydrated,
      (hydrated) => {
        if (hydrated && !called.current) {
          called.current = true;
          const { isAuthenticated, getCurrentUser } = useAuthStore.getState();
          if (isAuthenticated) {
            getCurrentUser().catch(() => {});
          }
          unsub();
        }
      },
      { fireImmediately: true }
    );
    return () => unsub();
  }, []);

  return <>{children}</>;
}
