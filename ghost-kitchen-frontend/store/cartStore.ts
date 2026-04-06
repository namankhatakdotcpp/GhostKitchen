"use client";

import { create } from "zustand";
import { persist, type PersistStorage } from "zustand/middleware";

import { api } from "@/lib/api";
import type { CartItem, MenuItem } from "@/types";

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
  getSubtotal: () => number;
};

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
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

    set({ isPlacingOrder: true });

    try {
      await api.post('/orders', {
        restaurantId,
        items: items.map(i => ({ menuItemId: i.menuItem.id, quantity: i.quantity })),
        deliveryAddress: {},
        couponCode: undefined,
      });

      set({
        restaurantId: null,
        items: [],
        isPlacingOrder: false,
        lastUpdatedAt: Date.now(),
      });
    } catch (error) {
      console.error('Error placing order:', error);
      set({ isPlacingOrder: false });
      throw error;
    }
  },
  getSubtotal: () => {
    const { items } = get();
    return items.reduce((total, cartItem) => {
      const itemPrice = cartItem.menuItem.price || 0;
      return total + (itemPrice * cartItem.quantity);
    }, 0);
  },
    }),
    { name: 'ghost-kitchen-cart' }
  )
);
