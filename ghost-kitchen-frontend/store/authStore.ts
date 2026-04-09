/**
 * Auth Store (Zustand)
 * 
 * WHY Zustand:
 * - Lightweight (~2KB)
 * - No unnecessary re-renders
 * - Simple API
 * - Great for auth state
 * 
 * Stores:
 * - User info
 * - Access token
 * - Refresh token
 * - Loading states
 * - Error messaging
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

const axiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true, // Send cookies with requests
});

export const useAuthStore = create(
  persist(
    (set, get) => ({
      // State
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      // Clear error
      clearError: () => set({ error: null }),

      /**
       * Register new user
       */
      register: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axiosInstance.post("/auth/register", data);
          const { user, tokens } = response.data.data;

          set({
            user,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });

          return response.data;
        } catch (error) {
          const errorMessage =
            error.response?.data?.message || "Registration failed";
          set({
            error: errorMessage,
            isLoading: false,
          });
          throw error;
        }
      },

      /**
       * Login user
       */
      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axiosInstance.post("/auth/login", {
            email,
            password,
          });
          const { user, tokens } = response.data.data;

          set({
            user,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            isAuthenticated: true,
            isLoading: false,
          });

          return response.data;
        } catch (error) {
          const errorMessage =
            error.response?.data?.message || "Login failed";
          set({
            error: errorMessage,
            isLoading: false,
          });
          throw error;
        }
      },

      /**
       * Refresh access token
       * Called when access token expires
       */
      refreshAccessToken: async () => {
        try {
          const state = get();
          if (!state.refreshToken) {
            throw new Error("No refresh token available");
          }

          const response = await axiosInstance.post("/auth/refresh", {
            refreshToken: state.refreshToken,
          });

          const { accessToken } = response.data.data;
          set({ accessToken });

          return accessToken;
        } catch (error) {
          // If refresh fails, logout
          get().logout();
          throw error;
        }
      },

      /**
       * Logout user
       */
      logout: async () => {
        try {
          const state = get();
          if (state.accessToken) {
            // Call logout endpoint to invalidate refresh token
            await axiosInstance.post("/auth/logout", {
              refreshToken: state.refreshToken,
            });
          }
        } catch (error) {
          console.error("Logout error:", error);
        } finally {
          // Clear state regardless of API error
          set({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            error: null,
          });
          // Clear localStorage
          localStorage.removeItem("auth-storage");
        }
      },

      /**
       * Get current user from API
       */
      getCurrentUser: async () => {
        set({ isLoading: true });
        try {
          const response = await axiosInstance.get("/auth/me");
          const user = response.data.data.user;
          set({ user, isLoading: false });
          return user;
        } catch (error) {
          set({ isLoading: false, isAuthenticated: false });
          throw error;
        }
      },

      /**
       * Update user profile
       */
      updateProfile: async (data) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axiosInstance.put("/auth/profile", data);
          const user = response.data.data.user;
          set({ user, isLoading: false });
          return response.data;
        } catch (error) {
          const errorMessage =
            error.response?.data?.message || "Update failed";
          set({
            error: errorMessage,
            isLoading: false,
          });
          throw error;
        }
      },
    }),
    {
      name: "auth-storage", // localStorage key name
      partialize: (state) => ({
        // Only persist these fields
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Set up axios interceptor for token refresh
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If access token expired and we haven't retried yet
    if (
      error.response?.status === 401 &&
      error.response?.data?.message?.includes("expired") &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        // Refresh token
        const newAccessToken = await useAuthStore.getState().refreshAccessToken();

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout user
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Export configured axios for use in other parts of the app
export default axiosInstance;
