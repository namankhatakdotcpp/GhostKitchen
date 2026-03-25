"use client";

import { create } from "zustand";

import { getRestaurantById, primaryAddress } from "@/lib/mockData";
import { useOrderStore } from "@/store/orderStore";
import type { CartItem, MenuItem, Order } from "@/types";

type CartStore = {
  restaurantId: string | null;
  items: CartItem[];
  isPlacingOrder: boolean;
  lastUpdatedAt: number;
  addItem: (menuItem: MenuItem) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  clearCart: () => void;
  placeOrder: () => Promise<void>;
};

export const useCartStore = create<CartStore>((set, get) => ({
  restaurantId: null,
  items: [],
  isPlacingOrder: false,
  lastUpdatedAt: 0,
  addItem: (menuItem) => {
    const { restaurantId, items } = get();

    if (restaurantId && restaurantId !== menuItem.restaurantId) {
      window.alert("Cart already contains items from another restaurant");
      return;
    }

    const existingItem = items.find(
      (cartItem) => cartItem.menuItem.id === menuItem.id,
    );

    if (existingItem) {
      set({
        items: items.map((cartItem) =>
          cartItem.menuItem.id === menuItem.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem,
        ),
        lastUpdatedAt: Date.now(),
      });

      return;
    }

    set({
      restaurantId: menuItem.restaurantId,
      items: [...items, { menuItem, quantity: 1 }],
      lastUpdatedAt: Date.now(),
    });
  },
  removeItem: (menuItemId) => {
    set((state) => {
      const nextItems = state.items.filter(
        (item) => item.menuItem.id !== menuItemId,
      );

      return {
        items: nextItems,
        restaurantId: nextItems.length ? state.restaurantId : null,
        lastUpdatedAt: Date.now(),
      };
    });
  },
  updateQuantity: (menuItemId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(menuItemId);
      return;
    }

    set((state) => ({
      items: state.items.map((item) =>
        item.menuItem.id === menuItemId ? { ...item, quantity } : item,
      ),
      lastUpdatedAt: Date.now(),
    }));
  },
  clearCart: () => {
    set({
      restaurantId: null,
      items: [],
      isPlacingOrder: false,
      lastUpdatedAt: Date.now(),
    });
  },
  placeOrder: async () => {
    const { items, restaurantId } = get();

    if (!items.length || !restaurantId) {
      return;
    }

    const restaurant = getRestaurantById(restaurantId);

    if (!restaurant) {
      return;
    }

    set({ isPlacingOrder: true });

    await new Promise((resolve) => setTimeout(resolve, 800));

    const subtotal = items.reduce(
      (sum, item) => sum + item.menuItem.price * item.quantity,
      0,
    );
    const deliveryFee = restaurant.deliveryFee;
    const discount = subtotal > 799 ? 120 : 0;

    const order: Order = {
      id: `gk-order-${Date.now()}`,
      customerId: "demo-customer",
      restaurantId,
      restaurant,
      items: items.map((item) => ({
        menuItem: item.menuItem,
        quantity: item.quantity,
        price: item.menuItem.price,
      })),
      status: "PLACED",
      subtotal,
      total: subtotal + deliveryFee - discount,
      deliveryFee,
      discount,
      deliveryAddress: primaryAddress,
      createdAt: new Date().toISOString(),
      estimatedDelivery: new Date(Date.now() + 32 * 60 * 1000).toISOString(),
    };

    useOrderStore.getState().createOrder(order);

    set({
      restaurantId: null,
      items: [],
      isPlacingOrder: false,
      lastUpdatedAt: Date.now(),
    });
  },
}));
