import axios, { AxiosError } from "axios";

import type { ApiErrorPayload } from "@/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "https://ghostkitchen.onrender.com/api";

export const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  // Cookies (access_token, refresh_token) are sent automatically by the browser.
  withCredentials: true,
});

// ── Response interceptor ──────────────────────────────────────────────────────
// When the server returns 401 + code:"TOKEN_EXPIRED", silently refresh the
// access token by hitting /auth/refresh (which sends the refresh_token cookie)
// then replay the original request once.
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
        // /auth/refresh reads the refresh_token cookie and sets a new access_token cookie
        await api.post("/auth/refresh");
        // Replay the original request — the new cookie will be sent automatically
        return api(originalConfig);
      } catch {
        // Refresh itself failed (expired / revoked) → force login
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
