/**
 * Auth API Client
 * Helper functions for making auth API calls
 * Uses the configured axios instance from authStore
 */

import axiosInstance from "@/store/authStore";

export const authApi = {
  /**
   * Register new user
   */
  register: async (data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: "CUSTOMER" | "SHOPKEEPER" | "DELIVERY" | "ADMIN";
  }) => {
    return axiosInstance.post("/auth/register", data);
  },

  /**
   * Login user
   */
  login: async (email: string, password: string) => {
    return axiosInstance.post("/auth/login", {
      email,
      password,
    });
  },

  /**
   * Get current user
   */
  getMe: async () => {
    return axiosInstance.get("/auth/me");
  },

  /**
   * Refresh access token
   */
  refreshToken: async (refreshToken: string) => {
    return axiosInstance.post("/auth/refresh", { refreshToken });
  },

  /**
   * Logout
   */
  logout: async () => {
    return axiosInstance.post("/auth/logout");
  },

  /**
   * Logout from all devices
   */
  logoutAll: async () => {
    return axiosInstance.post("/auth/logout-all");
  },
};
