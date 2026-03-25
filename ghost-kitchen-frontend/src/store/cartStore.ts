import { create } from "zustand";
import { useOrderStore } from "./orderStore";

type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

type CartStore = {
  restaurantId: string | null;
  items: CartItem[];
  isPlacingOrder: boolean;

  addItem: (
    restaurantId: string,
    item: Omit<CartItem, "qty">
  ) => void;

  clearCart: () => void;
  placeOrder: () => Promise<void>;
};

export const useCartStore = create<CartStore>((set, get) => ({
  restaurantId: null,
  items: [],
  isPlacingOrder: false,

  addItem: (restaurantId, item) => {
    const { restaurantId: currentRestaurant, items } = get();

    // 🔒 Enforce single restaurant cart
    if (currentRestaurant && currentRestaurant !== restaurantId) {
      alert("Cart already contains items from another restaurant");
      return;
    }

    const existing = items.find((i) => i.id === item.id);

    if (existing) {
      set({
        items: items.map((i) =>
          i.id === item.id ? { ...i, qty: i.qty + 1 } : i
        ),
      });
    } else {
      set({
        restaurantId,
        items: [...items, { ...item, qty: 1 }],
      });
    }
  },

  clearCart: () => {
    set({
      restaurantId: null,
      items: [],
      isPlacingOrder: false,
    });
  },

  placeOrder: async () => {
    const { items } = get();
    if (items.length === 0) return;

    set({ isPlacingOrder: true });

    // ⏳ Backend will be async later
    await new Promise((res) => setTimeout(res, 1000));

    alert("Order placed (mock)");
    useOrderStore.getState().createOrder();

    set({
      restaurantId: null,
      items: [],
      isPlacingOrder: false,
    });
  },
}));
