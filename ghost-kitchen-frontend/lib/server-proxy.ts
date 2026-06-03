import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { ApiErrorPayload } from "@/types";

type ProxyOptions = {
  path: string;
  method?: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  body?: unknown;
  searchParams?: URLSearchParams;
  requireAuth?: boolean;
};

const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "";

export class ProxyHttpError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

export function isBackendConfigured() {
  return Boolean(backendBaseUrl);
}

export function jsonError(error: string, code: number) {
  return NextResponse.json<ApiErrorPayload>({ error, code }, { status: code });
}

// Read the access_token from the HttpOnly cookie jar (server-side only)
function getAccessTokenFromCookies(): string | null {
  try {
    const cookieStore = cookies();
    return cookieStore.get("access_token")?.value ?? null;
  } catch {
    return null;
  }
}

export async function proxyJson<T>({
  path,
  method = "GET",
  body,
  searchParams,
  requireAuth = false,
}: ProxyOptions): Promise<T> {
  if (!backendBaseUrl) throw new ProxyHttpError("Backend is not configured.", 503);

  const accessToken = getAccessTokenFromCookies();

  if (requireAuth && !accessToken) throw new ProxyHttpError("Unauthorized", 401);

  const url = new URL(`${backendBaseUrl}${path}`);
  if (searchParams) url.search = searchParams.toString();

  try {
    const response = await fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        // Forward the token as a Bearer header for the backend's fallback path
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 401) throw new ProxyHttpError("Unauthorized", 401);
      if (response.status === 404) throw new ProxyHttpError("Not found", 404);
      throw new ProxyHttpError("Unable to complete the request.", response.status);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ProxyHttpError) throw error;
    throw new ProxyHttpError("Backend service unavailable.", 503);
  }
}
