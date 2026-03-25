import { NextResponse } from "next/server";

import { getOrderById } from "@/lib/mockData";
import {
  ProxyHttpError,
  jsonError,
  isBackendConfigured,
  proxyJson,
} from "@/lib/server-proxy";
import type { OrderResponse } from "@/types";

type Context = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Context) {
  try {
    if (!isBackendConfigured()) {
      const order = getOrderById(params.id);

      if (!order) {
        return jsonError("Order not found.", 404);
      }

      return NextResponse.json<OrderResponse>({ order });
    }

    const response = await proxyJson<OrderResponse>({
      path: `/orders/${params.id}`,
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
