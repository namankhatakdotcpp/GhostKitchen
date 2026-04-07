import axios, { AxiosError } from "axios";
import { getSession } from "next-auth/react";

import type { ApiErrorPayload } from "@/types";

type ApiErrorResponse = {
  error?: string;
  code?: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

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
});

api.interceptors.request.use(async (config) => {
  const url = config.baseURL + config.url;
  if (typeof window !== "undefined") {
    console.log("📤 API Request:", url);
  }
  const session = await getSession();
  const accessToken = (session as { accessToken?: string } | null)
    ?.accessToken;

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
