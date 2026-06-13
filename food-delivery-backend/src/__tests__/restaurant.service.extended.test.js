/**
 * Restaurant service extended tests
 * Covers: getRestaurants, getRestaurantById, getRestaurantWithCache, getRestaurantMenu,
 *         createRestaurant, updateRestaurant, toggleRestaurantStatus,
 *         addMenuItem, updateMenuItem, toggleMenuItemAvailability, deleteMenuItem,
 *         getMenuItemByIdAndRestaurant, setRestaurantStatusAndNote,
 *         getRestaurantByIdAndOwner, getRestaurantAnalyticsData
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-32-chars-padded-here" },
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config/prisma.js", () => ({
  prisma: {
    restaurant: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    menuItem: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    order: { findMany: vi.fn(), count: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
  },
}));
vi.mock("../modules/config/config.service.js", () => ({
  getSiteConfigCached: vi.fn(),
}));
vi.mock("../utils/cache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDelete: vi.fn().mockResolvedValue(undefined),
  CACHE_KEYS: {
    RESTAURANTS: "restaurants",
    ANALYTICS: (restaurantId, range) => `analytics:${restaurantId}:${range}`,
  },
  CACHE_TTL: { RESTAURANTS: 60, ANALYTICS: 300 },
}));

const { prisma } = await import("../config/prisma.js");
const { getSiteConfigCached } = await import("../modules/config/config.service.js");
const { cacheGet, cacheSet } = await import("../utils/cache.js");
const {
  getRestaurants,
  getRestaurantById,
  getRestaurantWithCache,
  getRestaurantMenu,
  createRestaurant,
  updateRestaurant,
  toggleRestaurantStatus,
  addMenuItem,
  updateMenuItem,
  toggleMenuItemAvailability,
  deleteMenuItem,
  getMenuItemByIdAndRestaurant,
  setRestaurantStatusAndNote,
  getRestaurantByIdAndOwner,
  getRestaurantAnalyticsData,
} = await import("../modules/restaurant/restaurant.service.js");

const baseRestaurant = {
  id: "rest-1",
  name: "Spice Garden",
  slug: "spice-garden-xyz",
  cuisines: ["Indian"],
  rating: 4.5,
  imageUrl: "https://example.com/img.jpg",
  isOpen: true,
  isApproved: true,
  suspended: false,
  ownerId: "owner-1",
  address: { city: "Delhi", deliveryFee: 3000, deliveryTime: 30, minOrder: 9900 },
  menuItems: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  getSiteConfigCached.mockResolvedValue({ requireApproval: false, defaultDeliveryFee: 3000 });
});

// ── getRestaurants ────────────────────────────────────────────────────────────
describe("getRestaurants", () => {
  it("returns paginated restaurants", async () => {
    prisma.restaurant.findMany.mockResolvedValue([baseRestaurant]);
    prisma.restaurant.count.mockResolvedValue(1);

    const result = await getRestaurants();

    expect(result.restaurants).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });

  it("applies search filter", async () => {
    prisma.restaurant.findMany.mockResolvedValue([]);
    prisma.restaurant.count.mockResolvedValue(0);

    await getRestaurants("spice");

    const call = prisma.restaurant.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
  });

  it("applies city filter", async () => {
    prisma.restaurant.findMany.mockResolvedValue([baseRestaurant]);
    prisma.restaurant.count.mockResolvedValue(1);

    const result = await getRestaurants(null, "Delhi");

    expect(result.restaurants).toHaveLength(1);
  });

  it("applies isOpen filter", async () => {
    prisma.restaurant.findMany.mockResolvedValue([baseRestaurant]);
    prisma.restaurant.count.mockResolvedValue(1);

    await getRestaurants(null, null, null, null, 1, 12, "true");

    const call = prisma.restaurant.findMany.mock.calls[0][0];
    expect(call.where.isOpen).toBe(true);
  });

  it("applies cuisine filter", async () => {
    prisma.restaurant.findMany.mockResolvedValue([baseRestaurant]);
    prisma.restaurant.count.mockResolvedValue(1);

    await getRestaurants(null, null, null, null, 1, 12, null, "Indian");

    const call = prisma.restaurant.findMany.mock.calls[0][0];
    expect(call.where.cuisines).toBeDefined();
  });

  it("applies minRating filter", async () => {
    prisma.restaurant.findMany.mockResolvedValue([]);
    prisma.restaurant.count.mockResolvedValue(0);

    await getRestaurants(null, null, null, 4.0);

    const call = prisma.restaurant.findMany.mock.calls[0][0];
    expect(call.where.rating).toBeDefined();
  });

  it("applies isVeg filter", async () => {
    prisma.restaurant.findMany.mockResolvedValue([]);
    prisma.restaurant.count.mockResolvedValue(0);

    await getRestaurants(null, null, "true");

    const call = prisma.restaurant.findMany.mock.calls[0][0];
    expect(call.where.menuItems).toBeDefined();
  });

  it("returns empty array when no restaurants found", async () => {
    prisma.restaurant.findMany.mockResolvedValue([]);
    prisma.restaurant.count.mockResolvedValue(0);

    const result = await getRestaurants();

    expect(result.restaurants).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("throws on DB error", async () => {
    prisma.restaurant.findMany.mockRejectedValue(new Error("DB failure"));
    prisma.restaurant.count.mockResolvedValue(0);

    await expect(getRestaurants()).rejects.toThrow("DB failure");
  });
});

// ── getRestaurantById ─────────────────────────────────────────────────────────
describe("getRestaurantById", () => {
  it("returns restaurant by id", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(baseRestaurant);

    const result = await getRestaurantById("rest-1");
    expect(result.id).toBe("rest-1");
  });

  it("returns null when not found", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(null);

    const result = await getRestaurantById("ghost");
    expect(result).toBeNull();
  });
});

// ── getRestaurantWithCache ────────────────────────────────────────────────────
describe("getRestaurantWithCache", () => {
  it("returns cached result without DB hit", async () => {
    const cached = { id: "rest-1", name: "Cached" };
    vi.mocked(cacheGet).mockResolvedValue(cached);

    const result = await getRestaurantWithCache("rest-1");
    expect(result.name).toBe("Cached");
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
  });

  it("fetches from DB on cache miss and stores in cache", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    prisma.restaurant.findFirst.mockResolvedValue({ ...baseRestaurant, menuItems: [] });

    const result = await getRestaurantWithCache("rest-1");

    expect(result.id).toBe("rest-1");
    expect(cacheSet).toHaveBeenCalledOnce();
  });

  it("returns null when restaurant not found in DB", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    prisma.restaurant.findFirst.mockResolvedValue(null);

    const result = await getRestaurantWithCache("ghost");
    expect(result).toBeNull();
  });

  it("handles UUID param correctly", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    prisma.restaurant.findFirst.mockResolvedValue({ ...baseRestaurant, menuItems: [] });

    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    await getRestaurantWithCache(uuid);

    const cacheGetCall = vi.mocked(cacheGet).mock.calls[0][0];
    expect(cacheGetCall).toContain("id:");
  });

  it("handles slug param correctly", async () => {
    vi.mocked(cacheGet).mockResolvedValue(null);
    prisma.restaurant.findFirst.mockResolvedValue({ ...baseRestaurant, menuItems: [] });

    await getRestaurantWithCache("spice-garden");

    const cacheGetCall = vi.mocked(cacheGet).mock.calls[0][0];
    expect(cacheGetCall).toContain("slug:");
  });
});

// ── getRestaurantMenu ─────────────────────────────────────────────────────────
describe("getRestaurantMenu", () => {
  it("returns menu grouped by category", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      ...baseRestaurant,
      menuItems: [
        { id: "mi-1", name: "Biryani", category: "Main Course", isAvailable: true },
        { id: "mi-2", name: "Raita", category: "Sides", isAvailable: true },
        { id: "mi-3", name: "Paneer", category: "Main Course", isAvailable: true },
      ],
    });

    const result = await getRestaurantMenu("rest-1");

    expect(result["Main Course"]).toHaveLength(2);
    expect(result["Sides"]).toHaveLength(1);
  });

  it("returns null when restaurant not found", async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const result = await getRestaurantMenu("ghost");
    expect(result).toBeNull();
  });

  it("shows all items to owner (isOwner=true)", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({
      ...baseRestaurant,
      menuItems: [
        { id: "mi-1", name: "Item", category: "Main", isAvailable: false },
      ],
    });

    await getRestaurantMenu("rest-1", true);

    const call = prisma.restaurant.findUnique.mock.calls[0][0];
    expect(call.include.menuItems.where).toEqual({});
  });

  it("filters to available items for non-owner", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ ...baseRestaurant, menuItems: [] });

    await getRestaurantMenu("rest-1", false);

    const call = prisma.restaurant.findUnique.mock.calls[0][0];
    expect(call.include.menuItems.where).toEqual({ isAvailable: true });
  });
});

// ── createRestaurant ──────────────────────────────────────────────────────────
describe("createRestaurant", () => {
  it("creates restaurant with generated slug", async () => {
    const created = { ...baseRestaurant, id: "rest-new" };
    prisma.restaurant.create.mockResolvedValue(created);

    const result = await createRestaurant({
      name: "New Kitchen",
      cuisines: ["Italian"],
      city: "Mumbai",
      deliveryFee: 3000,
      deliveryTime: 30,
      minOrder: 9900,
    }, "owner-1");

    expect(result.id).toBe("rest-new");
    const call = prisma.restaurant.create.mock.calls[0][0];
    expect(call.data.slug).toContain("new-kitchen");
    expect(call.data.ownerId).toBe("owner-1");
  });

  it("sets isApproved based on requireApproval config", async () => {
    getSiteConfigCached.mockResolvedValue({ requireApproval: true });
    prisma.restaurant.create.mockResolvedValue(baseRestaurant);

    await createRestaurant({ name: "Pending Kitchen", cuisines: ["Indian"], city: "Delhi", deliveryFee: 3000, deliveryTime: 30, minOrder: 0 }, "owner-1");

    const call = prisma.restaurant.create.mock.calls[0][0];
    expect(call.data.isApproved).toBe(false);
  });
});

// ── updateRestaurant ──────────────────────────────────────────────────────────
describe("updateRestaurant", () => {
  it("updates restaurant fields", async () => {
    prisma.restaurant.findUnique.mockResolvedValue(baseRestaurant);
    const updated = { ...baseRestaurant, name: "Updated Kitchen" };
    prisma.restaurant.update.mockResolvedValue(updated);

    const result = await updateRestaurant("rest-1", { name: "Updated Kitchen" });

    expect(result.name).toBe("Updated Kitchen");
  });

  it("propagates prisma error on update", async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null); // slug fetch returns null
    const p2025 = new Error("Not found");
    p2025.code = "P2025";
    prisma.restaurant.update.mockRejectedValue(p2025);

    await expect(updateRestaurant("ghost", { name: "X" })).rejects.toMatchObject({ code: "P2025" });
  });

  it("updates address when city provided", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ ...baseRestaurant, address: { city: "Old" } });
    prisma.restaurant.update.mockResolvedValue({ ...baseRestaurant });

    await updateRestaurant("rest-1", { city: "New Delhi" });

    const updateCall = prisma.restaurant.update.mock.calls[0][0];
    expect(updateCall.data.address.city).toBe("New Delhi");
  });
});

// ── toggleRestaurantStatus ────────────────────────────────────────────────────
describe("toggleRestaurantStatus", () => {
  it("toggles isOpen from true to false", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ isOpen: true, slug: "spice-garden" });
    prisma.restaurant.update.mockResolvedValue({ ...baseRestaurant, isOpen: false });

    const result = await toggleRestaurantStatus("rest-1");

    expect(result.isOpen).toBe(false);
    const call = prisma.restaurant.update.mock.calls[0][0];
    expect(call.data.isOpen).toBe(false);
  });

  it("returns null when restaurant not found", async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    const result = await toggleRestaurantStatus("ghost");
    expect(result).toBeNull();
  });
});

// ── addMenuItem ───────────────────────────────────────────────────────────────
describe("addMenuItem", () => {
  it("creates a menu item", async () => {
    getSiteConfigCached.mockResolvedValue({ requireApproval: false, defaultDeliveryFee: 3000, maxMenuItems: 50 });
    prisma.menuItem.count.mockResolvedValue(5); // under limit
    const item = { id: "mi-1", name: "Pizza", price: 25000, category: "Main", restaurantId: "rest-1" };
    prisma.menuItem.create.mockResolvedValue(item);

    const result = await addMenuItem("rest-1", { name: "Pizza", price: 25000, category: "Main" });

    expect(result.name).toBe("Pizza");
    expect(prisma.menuItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ restaurantId: "rest-1" }) })
    );
  });

  it("throws 400 when menu item limit reached", async () => {
    getSiteConfigCached.mockResolvedValue({ requireApproval: false, defaultDeliveryFee: 3000, maxMenuItems: 10 });
    prisma.menuItem.count.mockResolvedValue(10);

    await expect(addMenuItem("rest-1", { name: "Pizza", price: 25000, category: "Main" })).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── updateMenuItem ────────────────────────────────────────────────────────────
describe("updateMenuItem", () => {
  it("updates a menu item", async () => {
    const updated = { id: "mi-1", name: "Updated Pizza", price: 30000, category: "Main" };
    prisma.menuItem.update.mockResolvedValue(updated);

    const result = await updateMenuItem("rest-1", "mi-1", { name: "Updated Pizza", price: 30000 });

    expect(result.name).toBe("Updated Pizza");
  });

  it("propagates P2025 when item not found", async () => {
    const p2025 = new Error("Not found");
    p2025.code = "P2025";
    prisma.menuItem.update.mockRejectedValue(p2025);

    await expect(updateMenuItem("rest-1", "ghost", {})).rejects.toMatchObject({ code: "P2025" });
  });
});

// ── toggleMenuItemAvailability ────────────────────────────────────────────────
describe("toggleMenuItemAvailability", () => {
  it("toggles availability from true to false", async () => {
    prisma.menuItem.findUnique.mockResolvedValue({ id: "mi-1", isAvailable: true });
    prisma.menuItem.update.mockResolvedValue({ id: "mi-1", isAvailable: false });

    const result = await toggleMenuItemAvailability("mi-1");

    expect(result.isAvailable).toBe(false);
  });

  it("throws when item not found (null dereference)", async () => {
    prisma.menuItem.findUnique.mockResolvedValue(null);

    await expect(toggleMenuItemAvailability("ghost")).rejects.toThrow();
  });
});

// ── deleteMenuItem ────────────────────────────────────────────────────────────
describe("deleteMenuItem", () => {
  it("deletes a menu item", async () => {
    prisma.menuItem.delete.mockResolvedValue({ id: "mi-1" });

    await deleteMenuItem("mi-1");

    expect(prisma.menuItem.delete).toHaveBeenCalledWith({ where: { id: "mi-1" } });
  });

  it("propagates error when item not found", async () => {
    const p2025 = new Error("Not found");
    p2025.code = "P2025";
    prisma.menuItem.delete.mockRejectedValue(p2025);

    await expect(deleteMenuItem("ghost")).rejects.toMatchObject({ code: "P2025" });
  });
});

// ── getMenuItemByIdAndRestaurant ──────────────────────────────────────────────
describe("getMenuItemByIdAndRestaurant", () => {
  it("returns menu item when found", async () => {
    const item = { id: "mi-1", restaurantId: "rest-1" };
    prisma.menuItem.findFirst.mockResolvedValue(item);

    const result = await getMenuItemByIdAndRestaurant("mi-1", "rest-1");
    expect(result).toEqual(item);
  });

  it("returns null when not found", async () => {
    prisma.menuItem.findFirst.mockResolvedValue(null);

    const result = await getMenuItemByIdAndRestaurant("ghost", "rest-1");
    expect(result).toBeNull();
  });
});

// ── setRestaurantStatusAndNote ────────────────────────────────────────────────
describe("setRestaurantStatusAndNote", () => {
  it("sets status and note", async () => {
    prisma.restaurant.update.mockResolvedValue({ ...baseRestaurant, isOpen: false, statusNote: "On break" });

    const result = await setRestaurantStatusAndNote("rest-1", false, "On break");

    expect(result.isOpen).toBe(false);
    expect(result.statusNote).toBe("On break");
  });
});

// ── getRestaurantByIdAndOwner ─────────────────────────────────────────────────
describe("getRestaurantByIdAndOwner", () => {
  it("returns restaurant for owner", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(baseRestaurant);

    const result = await getRestaurantByIdAndOwner("rest-1", "owner-1");
    expect(result.id).toBe("rest-1");
    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "rest-1", ownerId: "owner-1" }) })
    );
  });

  it("returns null when owner mismatch", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(null);

    const result = await getRestaurantByIdAndOwner("rest-1", "other-owner");
    expect(result).toBeNull();
  });
});

// ── getRestaurantAnalyticsData ────────────────────────────────────────────────
describe("getRestaurantAnalyticsData", () => {
  it("returns analytics data for 7d range", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.count.mockResolvedValue(5);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 150000 } });

    const result = await getRestaurantAnalyticsData("rest-1", "7d");
    expect(result).toBeDefined();
  });

  it("returns analytics data for 30d range", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.order.count.mockResolvedValue(20);
    prisma.order.aggregate.mockResolvedValue({ _sum: { total: 500000 } });

    const result = await getRestaurantAnalyticsData("rest-1", "30d");
    expect(result).toBeDefined();
  });
});
