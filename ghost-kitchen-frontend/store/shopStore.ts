"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ShopRestaurant {
  id: string;
  name: string;
  address: Record<string, unknown>;
  isOpen: boolean;
  cuisines: string[];
  imageUrl: string;
  rating: number;
}

interface ShopState {
  restaurants: ShopRestaurant[];
  activeRestaurantId: string | null;

  setRestaurants: (r: ShopRestaurant[]) => void;
  setActiveRestaurant: (id: string) => void;
  activeRestaurant: () => ShopRestaurant | null;
}

export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      restaurants: [],
      activeRestaurantId: null,

      setRestaurants: (restaurants) =>
        set({
          restaurants,
          activeRestaurantId: get().activeRestaurantId ?? restaurants[0]?.id ?? null,
        }),

      setActiveRestaurant: (id) => set({ activeRestaurantId: id }),

      activeRestaurant: () => {
        const { restaurants, activeRestaurantId } = get();
        return restaurants.find((r) => r.id === activeRestaurantId) ?? restaurants[0] ?? null;
      },
    }),
    { name: "gk-shop", partialize: (s) => ({ activeRestaurantId: s.activeRestaurantId }) }
  )
);
