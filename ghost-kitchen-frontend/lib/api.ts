import axios, { AxiosError } from "axios";
import { getSession } from "next-auth/react";

import type { ApiErrorPayload } from "@/types";

type ApiErrorResponse = {
  error?: string;
  code?: number;
};

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(async (config) => {
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

export default api;
