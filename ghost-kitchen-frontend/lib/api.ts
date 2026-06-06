import axios, { AxiosError } from "axios";

import type { ApiErrorPayload } from "@/types";
// Lazy import to avoid circular dependency — authStore itself doesn't import api.ts
import { useAuthStore } from "@/store/authStore";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "https://ghostkitchen.onrender.com/api";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

// ── Request interceptor — attach stored Bearer token ─────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    try {
      // Primary: read from localStorage (persisted Zustand state)
      const raw = localStorage.getItem("gk-auth");
      let token: string | null = raw ? JSON.parse(raw)?.state?.accessToken : null;
      // Fallback: read from in-memory Zustand store (handles timing edge cases
      // where setState was called but persist hasn't written to localStorage yet)
      if (!token) {
        token = useAuthStore.getState().accessToken;
      }
      if (token) {
        config.headers = config.headers ?? {};
        config.headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {
      // ignore parse errors
    }
  }
  return config;
});

// ── Response interceptor ──────────────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ code?: string; message?: string }>) => {
    const originalConfig = error.config as typeof error.config & { _retry?: boolean };

    if (
      error.response?.status === 401 &&
      error.response.data?.code === "TOKEN_EXPIRED" &&
      !originalConfig._retry
    ) {
      originalConfig._retry = true;
      try {
        // Pass stored refreshToken in body as fallback for cross-origin environments
        // where cookies may be blocked by the browser.
        let refreshToken: string | undefined;
        if (typeof window !== "undefined") {
          try {
            const raw = localStorage.getItem("gk-auth");
            refreshToken = raw ? JSON.parse(raw)?.state?.refreshToken : undefined;
          } catch { /* ignore */ }
        }

        const refreshRes = await api.post("/auth/refresh", refreshToken ? { refreshToken } : {});
        const newToken = refreshRes.data?.data?.accessToken;

        if (newToken && typeof window !== "undefined") {
          try {
            const raw = localStorage.getItem("gk-auth");
            if (raw) {
              const parsed = JSON.parse(raw);
              const newRefreshToken = refreshRes.data?.data?.refreshToken;
              parsed.state.accessToken = newToken;
              if (newRefreshToken) parsed.state.refreshToken = newRefreshToken;
              localStorage.setItem("gk-auth", JSON.stringify(parsed));
            }
          } catch { /* ignore */ }
        }

        // Replay the original request with the new token
        if (newToken && originalConfig.headers) {
          originalConfig.headers["Authorization"] = `Bearer ${newToken}`;
        }
        return api(originalConfig);
      } catch {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      }
    }

    const payload: ApiErrorPayload = {
      error:
        error.response?.data?.message ??
        error.message ??
        "Something went wrong.",
      code: error.response?.status ?? 500,
    };

    return Promise.reject(payload);
  }
);

export { API_BASE };
export default api;
