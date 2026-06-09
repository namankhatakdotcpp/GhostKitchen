"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import AuthProvider from "@/components/providers/AuthProvider";
import ToastProvider from "@/components/providers/ToastProvider";
import { useConfigStore } from "@/store/configStore";
import { api } from "@/lib/api";

type ProvidersProps = {
  children: ReactNode;
};

function ConfigLoader() {
  const setConfig = useConfigStore((s) => s.setConfig);
  useEffect(() => {
    api.get("/config").then(({ data }) => setConfig(data)).catch(() => {/* use defaults */});
  }, [setConfig]);
  return null;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
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
        <ConfigLoader />
        <ToastProvider />
        {children}
      </QueryClientProvider>
    </AuthProvider>
  );
}

