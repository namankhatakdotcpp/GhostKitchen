import { create } from "zustand";

type OrderStatus = "PENDING";

type OrderStore = {
  activeOrder: null | {
    id: string;
    status: OrderStatus;
  };
  createOrder: () => void;
  clearOrder: () => void;
};

export const useOrderStore = create<OrderStore>((set) => ({
  activeOrder: null,

  createOrder: () => {
    set({
      activeOrder: {
        id: crypto.randomUUID(),
        status: "PENDING",
      },
    });
  },

  clearOrder: () => {
    set({ activeOrder: null });
  },
}));
