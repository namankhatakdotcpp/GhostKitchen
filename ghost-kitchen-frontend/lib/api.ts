import axios, { AxiosError } from "axios";

import type { ApiErrorPayload } from "@/types";

type ApiErrorResponse = {
  error?: string;
  code?: number;
};

const API_BASE = "https://ghostkitchen.onrender.com/api";

// Debug logging
if (typeof window !== "undefined") {
  console.log("🔗 API BASE:", API_BASE);
  console.log("📍 Environment:", process.env.NODE_ENV);
}

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
});

api.interceptors.request.use(async (config) => {
  const url = new URL(
    config.url ?? '',
    config.baseURL ?? 'http://localhost'
  ).href;
  if (typeof window !== "undefined") {
    console.log("📤 API Request:", url);
  }
  
  let accessToken;
  if (typeof window !== "undefined") {
    const { useAuthStore } = require("@/store/authStore");
    accessToken = useAuthStore.getState().accessToken;
  }

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorResponse>) => {
    const payload: ApiErrorPayload = {
      error:
        error.response?.data?.error ??
        error.message ??
        "Something went wrong while talking to GhostKitchen.",
      code: error.response?.data?.code ?? error.response?.status ?? 500,
    };

    return Promise.reject(payload);
  },
);

// Debug function to test hardcoded URL (temporary)
export async function testRestaurantsHardcoded() {
  try {
    const hardcodedUrl = "https://ghostkitchen.onrender.com/api/restaurants";
    console.log("🧪 Testing hardcoded URL:", hardcodedUrl);
    const response = await axios.get(hardcodedUrl);
    console.log("✅ Hardcoded URL works!", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Hardcoded URL failed:", error);
    throw error;
  }
}

export { API_BASE };
export default api;
