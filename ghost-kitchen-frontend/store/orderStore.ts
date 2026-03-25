"use client";

import { create } from "zustand";

import type { Order } from "@/types";

type OrderStore = {
  activeOrder: Order | null;
  orders: Order[];
  setActiveOrder: (order: Order | null) => void;
  createOrder: (order: Order) => void;
  clearOrder: () => void;
};

export const useOrderStore = create<OrderStore>((set) => ({
  activeOrder: null,
  orders: [],
  setActiveOrder: (order) => set({ activeOrder: order }),
  createOrder: (order) => {
    set((state) => ({
      activeOrder: order,
      orders: [order, ...state.orders],
    }));
  },
  clearOrder: () => {
    set({ activeOrder: null });
  },
}));
