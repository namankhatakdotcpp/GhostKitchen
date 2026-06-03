"use client";

/**
 * Auth Store
 *
 * Tokens live in HttpOnly cookies managed by the server — never in JS memory
 * or localStorage.  This store only tracks the user object and loading state
 * so the UI can render the correct chrome without touching token logic.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

// Dedicated axios instance that always sends cookies
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
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  clearError: () => void;
  register: (data: { email: string; password: string; name: string; phone?: string }) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getCurrentUser: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      clearError: () => set({ error: null }),

      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axiosInstance.post("/auth/register", data);
          const user = response.data.data?.user ?? response.data.user;
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          const msg = err.response?.data?.message || err.response?.data?.error || "Registration failed"
          set({ error: msg, isLoading: false });
          throw err;
        }
      },

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axiosInstance.post("/auth/login", { email, password });
          const user = response.data.data?.user ?? response.data.user;
          set({ user, isAuthenticated: true, isLoading: false });
        } catch (err: any) {
          const msg = err.response?.data?.message || err.response?.data?.error || "Login failed"
          set({ error: msg, isLoading: false });
          throw err;
        }
      },

      logout: async () => {
        try {
          await axiosInstance.post("/auth/logout");
        } catch {
          // Server-side cookie clearing still happened; clear local state regardless
        }
        set({ user: null, isAuthenticated: false, error: null });
      },

      getCurrentUser: async () => {
        set({ isLoading: true });
        try {
          const response = await axiosInstance.get("/auth/me");
          const user = response.data.data?.user ?? response.data.user;
          set({ user, isAuthenticated: true, isLoading: false });
        } catch {
          set({ user: null, isAuthenticated: false, isLoading: false });
        }
      },
    }),
    {
      name: "gk-auth",
      // Only persist the user object — never tokens
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);

// Export the instance so cart/other stores can reuse it
export default axiosInstance;
