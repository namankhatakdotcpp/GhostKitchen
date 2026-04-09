/**
 * Cart Store (Zustand)
 * 
 * WHY backend-persistent cart:
 * - Cart shared across devices (login on phone → see same cart on laptop)
 * - Can't lose cart data (no localStorage dependency)
 * - Better checkout flow (can save for later)
 * 
 * Architecture:
 * - Frontend state: current cart (for UI updates)
 * - Backend source of truth: database cart items
 * - Sync: Every add/remove/update syncs with backend
 */

"use client";

import { create } from "zustand";
import axiosInstance from "./authStore";

type CartItem = {
  id: string;
  userId: string;
  menuItemId: string;
  quantity: number;
  menuItem: {
    id: string;
    name: string;
    price: number;
    imageUrl: string;
    restaurantId: string;
  };
};

type CartState = {
  items: CartItem[];
  total: number;
  isLoading: boolean;
  error: string | null;
  lastUpdatedAt?: number; // Timestamp for bounce animation

  // Actions
  fetchCart: () => Promise<void>;
  addToCart: (menuItemId: string, quantity?: number) => Promise<void>;
  removeFromCart: (cartItemId: string) => Promise<void>;
  updateQuantity: (cartItemId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  getSubtotal: () => number;
  getRestaurantId: () => string | null; // Added getter for restaurantId
};

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  total: 0,
  isLoading: false,
  error: null,
  lastUpdatedAt: undefined,

  /**
   * Fetch cart from backend
   * Source of truth is always the server
   */
  fetchCart: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await axiosInstance.get("/cart");
      const { items, total } = response.data.data;
      set({ items, total, isLoading: false });
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || "Failed to fetch cart";
      set({ error: errorMsg, isLoading: false, items: [] });
      throw error;
    }
  },

  /**
   * Add item to cart (or increase quantity if already exists)
   */
  addToCart: async (menuItemId: string, quantity = 1) => {
    set({ isLoading: true, error: null });
    try {
      await axiosInstance.post("/cart/add", { menuItemId, quantity });
      // Fetch updated cart
      await get().fetchCart();
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || "Failed to add to cart";
      set({ error: errorMsg, isLoading: false });
      throw error;
    }
  },

  /**
   * Remove item from cart
   */
  removeFromCart: async (cartItemId: string) => {
    set({ isLoading: true, error: null });
    try {
      await axiosInstance.delete(`/cart/${cartItemId}`);
      // Fetch updated cart
      await get().fetchCart();
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || "Failed to remove from cart";
      set({ error: errorMsg, isLoading: false });
      throw error;
    }
  },

  /**
   * Update item quantity
   */
  updateQuantity: async (cartItemId: string, quantity: number) => {
    if (quantity < 1) {
      // If quantity is 0 or negative, remove item instead
      return get().removeFromCart(cartItemId);
    }

    set({ isLoading: true, error: null });
    try {
      await axiosInstance.patch(`/cart/${cartItemId}`, { quantity });
      // Fetch updated cart
      await get().fetchCart();
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || "Failed to update quantity";
      set({ error: errorMsg, isLoading: false });
      throw error;
    }
  },

  /**
   * Clear entire cart
   */
  clearCart: async () => {
    set({ isLoading: true, error: null });
    try {
      await axiosInstance.delete("/cart");
      set({ items: [], total: 0, isLoading: false });
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || "Failed to clear cart";
      set({ error: errorMsg, isLoading: false });
      throw error;
    }
  },

  /**
   * Calculate subtotal (price only, no delivery fee)
   */
  getSubtotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => {
      return sum + item.menuItem.price * item.quantity;
    }, 0);
  },

  /**
   * Get restaurant ID from first cart item
   * All items in cart must be from same restaurant
   */
  getRestaurantId: () => {
    const { items } = get();
    return items.length > 0 ? items[0].menuItem.restaurantId : null;
  },
}));

