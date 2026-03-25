import { NextResponse } from "next/server";

import { getRestaurantMenuById } from "@/lib/mockData";
import {
  ProxyHttpError,
  jsonError,
  isBackendConfigured,
  proxyJson,
} from "@/lib/server-proxy";
import type { RestaurantMenuResponse } from "@/types";

type Context = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Context) {
  try {
    if (!isBackendConfigured()) {
      const menu = getRestaurantMenuById(params.id);

      if (!menu.length) {
        return jsonError("Restaurant menu not found.", 404);
      }

      return NextResponse.json<RestaurantMenuResponse>({
        restaurantId: params.id,
        menu,
      });
    }

    const response = await proxyJson<RestaurantMenuResponse>({
      path: `/restaurants/${params.id}/menu`,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProxyHttpError) {
      return jsonError(error.message, error.code);
    }

    return jsonError("Backend service unavailable.", 503);
  }
}
