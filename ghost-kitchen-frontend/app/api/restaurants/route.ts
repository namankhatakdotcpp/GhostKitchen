import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getRestaurantsPage } from "@/lib/mockData";
import {
  ProxyHttpError,
  jsonError,
  isBackendConfigured,
  proxyJson,
} from "@/lib/server-proxy";
import type { RestaurantListResponse } from "@/types";

const restaurantListQuerySchema = z.object({
  search: z.string().optional(),
  cuisine: z.string().optional(),
  rating: z.coerce.number().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(12),
});

export async function GET(request: NextRequest) {
  const queryParse = restaurantListQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );

  if (!queryParse.success) {
    return jsonError("Invalid restaurant query.", 400);
  }

  try {
    if (!isBackendConfigured()) {
      const { cuisine, page, limit, search } = queryParse.data;
      const pageData = await getRestaurantsPage({
        pageParam: page - 1,
        limit,
        category: cuisine ?? null,
        search: search ?? "",
        filters: queryParse.data.rating && queryParse.data.rating >= 4 ? ["Rating 4.0+"] : [],
      });

      return NextResponse.json<RestaurantListResponse>({
        restaurants: pageData.items,
        page,
        limit,
        total: pageData.total,
        totalPages: Math.max(1, Math.ceil(pageData.total / limit)),
      });
    }

    const response = await proxyJson<RestaurantListResponse>({
      path: "/api/restaurants",
      searchParams: request.nextUrl.searchParams,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ProxyHttpError) {
      return jsonError(error.message, error.code);
    }

    return jsonError("Backend service unavailable.", 503);
  }
}
