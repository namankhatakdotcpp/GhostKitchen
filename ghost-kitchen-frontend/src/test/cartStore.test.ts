import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the api module before importing the store
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

const { api } = await import("@/lib/api");
const { useCartStore } = await import("@/store/cartStore");

function makeItem(overrides = {}) {
  return {
    id: "cart-item-1",
    userId: "user-1",
    menuItemId: "menu-1",
    quantity: 2,
    menuItem: {
      id: "menu-1",
      name: "Butter Chicken",
      price: 34900, // ₹349 in paise
      imageUrl: "/img.jpg",
      restaurantId: "rest-1",
    },
    ...overrides,
  };
}

describe("cartStore — fetchCart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCartStore.setState({ items: [], total: 0, isLoading: false, error: null });
  });

  it("sets items and total from API response", async () => {
    const items = [makeItem()];
    vi.mocked(api.get).mockResolvedValue({ data: { data: { items, total: 69800 } } });

    await useCartStore.getState().fetchCart();

    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().total).toBe(69800);
    expect(useCartStore.getState().isLoading).toBe(false);
  });

  it("sets error and clears items on failure", async () => {
    vi.mocked(api.get).mockRejectedValue({ response: { data: { message: "Unauthorized" } } });

    await expect(useCartStore.getState().fetchCart()).rejects.toBeDefined();

    expect(useCartStore.getState().error).toBe("Unauthorized");
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});

describe("cartStore — addToCart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCartStore.setState({ items: [], total: 0, isLoading: false, error: null });
    // fetchCart will be called after add — set it up to return a new item
    vi.mocked(api.get).mockResolvedValue({
      data: { data: { items: [makeItem()], total: 69800 } },
    });
  });

  it("calls POST /cart/add and then syncs cart", async () => {
    vi.mocked(api.post).mockResolvedValue({});

    await useCartStore.getState().addToCart("menu-1", 1);

    expect(api.post).toHaveBeenCalledWith("/cart/add", { menuItemId: "menu-1", quantity: 1 });
    expect(api.get).toHaveBeenCalledWith("/cart");
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it("defaults quantity to 1 if not provided", async () => {
    vi.mocked(api.post).mockResolvedValue({});

    await useCartStore.getState().addToCart("menu-1");

    expect(api.post).toHaveBeenCalledWith("/cart/add", { menuItemId: "menu-1", quantity: 1 });
  });
});

describe("cartStore — removeFromCart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCartStore.setState({ items: [makeItem()], total: 69800, isLoading: false, error: null });
    vi.mocked(api.get).mockResolvedValue({ data: { data: { items: [], total: 0 } } });
  });

  it("calls DELETE /cart/:id and syncs cart", async () => {
    vi.mocked(api.delete).mockResolvedValue({});

    await useCartStore.getState().removeFromCart("cart-item-1");

    expect(api.delete).toHaveBeenCalledWith("/cart/cart-item-1");
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});

describe("cartStore — updateQuantity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCartStore.setState({ items: [makeItem()], total: 69800, isLoading: false, error: null });
    vi.mocked(api.get).mockResolvedValue({ data: { data: { items: [], total: 0 } } });
  });

  it("calls PATCH /cart/:id with new quantity", async () => {
    vi.mocked(api.patch).mockResolvedValue({});

    await useCartStore.getState().updateQuantity("cart-item-1", 3);

    expect(api.patch).toHaveBeenCalledWith("/cart/cart-item-1", { quantity: 3 });
  });

  it("calls removeFromCart when quantity < 1", async () => {
    vi.mocked(api.delete).mockResolvedValue({});

    await useCartStore.getState().updateQuantity("cart-item-1", 0);

    expect(api.delete).toHaveBeenCalledWith("/cart/cart-item-1");
    expect(api.patch).not.toHaveBeenCalled();
  });
});

describe("cartStore — getSubtotal", () => {
  it("sums price * quantity for all items (values in paise)", () => {
    useCartStore.setState({
      items: [
        makeItem({ quantity: 2, menuItem: { id: "m1", name: "A", price: 34900, imageUrl: "", restaurantId: "r1" } }),
        makeItem({ id: "cart-item-2", menuItemId: "menu-2", quantity: 1, menuItem: { id: "m2", name: "B", price: 15000, imageUrl: "", restaurantId: "r1" } }),
      ],
      total: 0,
      isLoading: false,
      error: null,
    });

    // 2 × 34900 + 1 × 15000 = 84800 paise
    expect(useCartStore.getState().getSubtotal()).toBe(84800);
  });

  it("returns 0 for empty cart", () => {
    useCartStore.setState({ items: [], total: 0, isLoading: false, error: null });
    expect(useCartStore.getState().getSubtotal()).toBe(0);
  });
});

describe("cartStore — getRestaurantId", () => {
  it("returns the restaurantId from the first item", () => {
    useCartStore.setState({ items: [makeItem()], total: 0, isLoading: false, error: null });
    expect(useCartStore.getState().getRestaurantId()).toBe("rest-1");
  });

  it("returns null for empty cart", () => {
    useCartStore.setState({ items: [], total: 0, isLoading: false, error: null });
    expect(useCartStore.getState().getRestaurantId()).toBeNull();
  });
});

describe("cartStore — clearCart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCartStore.setState({ items: [makeItem()], total: 69800, isLoading: false, error: null });
  });

  it("calls DELETE /cart and resets state", async () => {
    vi.mocked(api.delete).mockResolvedValue({});

    await useCartStore.getState().clearCart();

    expect(api.delete).toHaveBeenCalledWith("/cart");
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().total).toBe(0);
  });
});
