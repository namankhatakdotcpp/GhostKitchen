import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  ProxyHttpError,
  jsonError,
  isBackendConfigured,
  proxyJson,
} from "@/lib/server-proxy";
import type { CartResponse, CartSyncRequest } from "@/types";

const cartSyncSchema = z.object({
  restaurantId: z.string().min(1),
  items: z.array(
    z.object({
      menuItemId: z.string().min(1),
      quantity: z.number().int().min(1),
    }),
  ),
});

const emptyCartResponse: CartResponse = {
  restaurant: null,
  items: [],
  subtotal: 0,
  deliveryFee: 0,
  total: 0,
};

export async function GET() {
  try {
    if (!isBackendConfigured()) {
      return NextResponse.json<CartResponse>(emptyCartResponse);
    }

    const response = await proxyJson<CartResponse>({
      path: "/cart",
      requireAuth: true,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProxyHttpError) {
      return jsonError(error.message, error.code);
    }

    return jsonError("Backend service unavailable.", 503);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const bodyParse = cartSyncSchema.safeParse(body);

  if (!bodyParse.success) {
    return jsonError("Invalid cart payload.", 400);
  }

  try {
    if (!isBackendConfigured()) {
      return NextResponse.json<CartResponse>(emptyCartResponse);
    }

    const response = await proxyJson<CartResponse>({
      path: "/cart",
      method: "POST",
      body: bodyParse.data satisfies CartSyncRequest,
      requireAuth: true,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProxyHttpError) {
      return jsonError(error.message, error.code);
    }

    return jsonError("Backend service unavailable.", 503);
  }
}

export async function DELETE() {
  try {
    if (!isBackendConfigured()) {
      return NextResponse.json<CartResponse>(emptyCartResponse);
    }

    const response = await proxyJson<CartResponse>({
      path: "/cart",
      method: "DELETE",
      requireAuth: true,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProxyHttpError) {
      return jsonError(error.message, error.code);
    }

    return jsonError("Backend service unavailable.", 503);
  }
}
