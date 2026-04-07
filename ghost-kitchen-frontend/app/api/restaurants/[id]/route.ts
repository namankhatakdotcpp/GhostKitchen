import { NextResponse } from "next/server";

import { getRestaurantById, getRestaurantMenuById } from "@/lib/mockData";
import {
  ProxyHttpError,
  jsonError,
  isBackendConfigured,
  proxyJson,
} from "@/lib/server-proxy";
import type { RestaurantDetailResponse } from "@/types";

type Context = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Context) {
  try {
    if (!isBackendConfigured()) {
      const restaurant = getRestaurantById(params.id);
      const menu = getRestaurantMenuById(params.id);

      if (!restaurant) {
        return jsonError("Restaurant not found.", 404);
      }

      return NextResponse.json<RestaurantDetailResponse>({ restaurant, menu });
    }

    const response = await proxyJson<RestaurantDetailResponse>({
      path: `/api/restaurants/${params.id}`,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProxyHttpError) {
      return jsonError(error.message, error.code);
    }

    return jsonError("Backend service unavailable.", 503);
  }
}
