"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import AuthProvider from "@/components/providers/AuthProvider";
import ToastProvider from "@/components/providers/ToastProvider";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Don't retry on auth/permission errors — the axios interceptor already
            // handles TOKEN_EXPIRED refresh. Retrying 401/403/404 only spams the server.
            retry: (failureCount, error: unknown) => {
              const code = (error as { code?: number })?.code;
              if (code === 401 || code === 403 || code === 404) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider />
        {children}
      </QueryClientProvider>
    </AuthProvider>
  );
}

