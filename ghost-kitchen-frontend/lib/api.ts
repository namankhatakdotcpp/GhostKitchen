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
// Single-flight refresh: concurrent 401s share one refresh call. The backend
// rotates refresh tokens, so parallel refreshes would invalidate each other
// and randomly log users out (the second caller's token is already revoked).
let refreshInFlight: Promise<{
  accessToken?: string;
  refreshToken?: string;
  user?: unknown;
}> | null = null;

function getStoredRefreshToken(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem("gk-auth");
    return raw ? JSON.parse(raw)?.state?.refreshToken : undefined;
  } catch {
    return undefined;
  }
}

function performRefresh() {
  if (!refreshInFlight) {
    const refreshToken = getStoredRefreshToken();
    refreshInFlight = api
      .post("/auth/refresh", refreshToken ? { refreshToken } : {})
      .then((res) => res.data?.data ?? {})
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ code?: string; message?: string; error?: string }>) => {
    const originalConfig = error.config as typeof error.config & { _retry?: boolean };

    // Auto-refresh-and-retry on ANY 401, not just the explicitly-coded
    // TOKEN_EXPIRED case — the backend's auth middleware only attaches that
    // code for a genuinely expired JWT (auth.middleware.js); a transient
    // first-load 401 ("No token provided"/"Invalid token", no code at all)
    // used to fall straight through to the caller with zero recovery path.
    // For a request wrapped in TanStack Query that's papered over by its
    // default retry; for a raw axios call with no retry config of its own
    // (e.g. shop-shell.tsx's RestaurantSelector effect) it meant permanently
    // empty state until a manual page reload. Gate only on "do we have a
    // refresh token at all" — if not, this really is a logged-out user and
    // the existing redirect-to-/login behavior below still applies.
    const hasRefreshToken = !!getStoredRefreshToken();
    if (
      error.response?.status === 401 &&
      hasRefreshToken &&
      !originalConfig._retry
    ) {
      originalConfig._retry = true;
      try {
        const { accessToken: newToken, refreshToken: newRefreshToken, user: refreshedUser } =
          await performRefresh();

        if (newToken && typeof window !== "undefined") {
          try {
            // Keep localStorage in sync
            const raw = localStorage.getItem("gk-auth");
            if (raw) {
              const parsed = JSON.parse(raw);
              parsed.state.accessToken = newToken;
              if (newRefreshToken) parsed.state.refreshToken = newRefreshToken;
              localStorage.setItem("gk-auth", JSON.stringify(parsed));
            }
          } catch { /* ignore */ }

          // Also update Zustand store so roles/user data stay fresh
          const storeUpdate: Record<string, unknown> = { accessToken: newToken };
          if (newRefreshToken) storeUpdate.refreshToken = newRefreshToken;
          if (refreshedUser) storeUpdate.user = refreshedUser;
          useAuthStore.setState(storeUpdate as never);
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
        error.response?.data?.error ??
        error.message ??
        "Something went wrong.",
      code: error.response?.status ?? 500,
    };

    return Promise.reject(payload);
  }
);

export { API_BASE };
export default api;
