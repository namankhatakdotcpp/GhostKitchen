"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

const axiosInstance = axios.create({ baseURL: API_URL, withCredentials: true });

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  roles: string[];
  activeRole: string;
  secondRole?: string | null;
  restaurantId?: string | null;
}

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasHydrated: boolean;
  error: string | null;

  setHasHydrated: (v: boolean) => void;
  setTokens: (accessToken: string, refreshToken?: string) => void;
  clearError: () => void;
  register: (data: { email: string; password: string; name: string; phone?: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getCurrentUser: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      hasHydrated: false,
      error: null,

      setHasHydrated: (v) => set({ hasHydrated: v }),

      setTokens: (accessToken, refreshToken) =>
        set(refreshToken ? { accessToken, refreshToken } : { accessToken }),

      clearError: () => set({ error: null }),

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axiosInstance.post("/auth/register", data);
          const { user, accessToken, refreshToken } = response.data.data ?? response.data;
          set({ user, accessToken, refreshToken, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          const msg = err.response?.data?.message || err.response?.data?.error || "Registration failed";
          set({ error: msg, isLoading: false });
          throw err;
        }
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axiosInstance.post("/auth/login", { email, password });
          const { user, accessToken, refreshToken } = response.data.data ?? response.data;
          set({ user, accessToken, refreshToken, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          const msg = err.response?.data?.message || err.response?.data?.error || "Login failed";
          set({ error: msg, isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          // Use the shared api instance so the Bearer token interceptor fires,
          // ensuring the backend can invalidate the session even after cookies expire.
          const { api } = await import("@/lib/api");
          await api.post("/auth/logout");
        } catch {
          // Server-side cookie clearing still happened; clear local state regardless
        }
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, error: null });
      },

      getCurrentUser: async () => {
        set({ isLoading: true });
        try {
          const { accessToken } = get();
          const response = await axiosInstance.get("/auth/me", {
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          });
          const user = response.data.data?.user ?? response.data.user;
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          const code = err?.response?.data?.code;
          const status = err?.response?.status;
          const isDefinitivelyLoggedOut =
            status === 401 && (code === "TOKEN_INVALID" || code === "NO_TOKEN");
          if (isDefinitivelyLoggedOut) {
            set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, isLoading: false });
          } else {
            set({ isLoading: false });
          }
        }
      },
    }),
    {
      name: "gk-auth",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

export default axiosInstance;
