import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getOrderById,
  getOrders,
  getRestaurantById,
  getRestaurantMenuById,
  primaryAddress,
} from "@/lib/mockData";
import {
  ProxyHttpError,
  jsonError,
  isBackendConfigured,
  proxyJson,
} from "@/lib/server-proxy";
import type { CreateOrderRequest, OrderResponse, OrdersListResponse } from "@/types";

const createOrderSchema = z.object({
  restaurantId: z.string().min(1),
  items: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        quantity: z.number().int().min(1),
      }),
    )
    .min(1),
  addressId: z.string().min(1),
  couponCode: z.string().optional(),
});

export async function GET() {
  try {
    if (!isBackendConfigured()) {
      return NextResponse.json<OrdersListResponse>({
        orders: getOrders(),
      });
    }

    const response = await proxyJson<OrdersListResponse>({
      path: "/orders",
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
  const bodyParse = createOrderSchema.safeParse(body);

  if (!bodyParse.success) {
    return jsonError("Invalid order payload.", 400);
  }

  try {
    if (!isBackendConfigured()) {
      const restaurant = getRestaurantById(bodyParse.data.restaurantId);

      if (!restaurant) {
        return jsonError("Restaurant not found.", 404);
      }

      const menu = getRestaurantMenuById(bodyParse.data.restaurantId).flatMap(
        (section) => section.items,
      );
      const items = bodyParse.data.items.map((item) => {
        const menuItem = menu.find((candidate) => candidate.id === item.menuItemId);

        if (!menuItem) {
          throw new ProxyHttpError("Menu item not found.", 404);
        }

        return {
          menuItem,
          quantity: item.quantity,
          price: menuItem.price,
        };
      });

      const subtotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      );
      const order = {
        id: `gk-order-${Date.now()}`,
        customerId: "demo-customer",
        restaurantId: restaurant.id,
        restaurant,
        orderItems: items,
        status: "PLACED" as const,
        total: subtotal + restaurant.deliveryFee,
        deliveryFee: restaurant.deliveryFee,
        subtotal,
        discount: 0,
        deliveryAddress: primaryAddress,
        createdAt: new Date().toISOString(),
        estimatedDelivery: new Date(Date.now() + 35 * 60 * 1000).toISOString(),
        timeline: getOrderById("gk-order-1025")?.timeline ?? [],
        restaurantTypeEmoji: "🍽️",
      };

      return NextResponse.json<OrderResponse>({ order }, { status: 201 });
    }

    const response = await proxyJson<OrderResponse>({
      path: "/orders",
      method: "POST",
      body: bodyParse.data satisfies CreateOrderRequest,
      requireAuth: true,
    });

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof ProxyHttpError) {
      return jsonError(error.message, error.code);
    }

    return jsonError("Backend service unavailable.", 503);
  }
}
