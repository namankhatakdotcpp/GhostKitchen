/**
 * Restaurant controller extended tests
 * Covers: getMyRestaurant, listRestaurants, getRestaurant, getMenu,
 *         createNewRestaurant, updateExistingRestaurant, toggleStatus,
 *         setRestaurantStatus, addNewMenuItem, updateExistingMenuItem,
 *         toggleMenuItemStatus, deleteExistingMenuItem
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
    restaurant: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    menuItem: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    order: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    favorite: { findMany: vi.fn() },
  },
}));
vi.mock("../utils/cache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDelete: vi.fn().mockResolvedValue(undefined),
  CACHE_KEYS: { RESTAURANTS: "restaurants", ANALYTICS: (id, r) => `a:${id}:${r}` },
  CACHE_TTL: { RESTAURANTS: 60, ANALYTICS: 300 },
}));
vi.mock("../modules/config/config.service.js", () => ({
  getSiteConfigCached: vi.fn().mockResolvedValue({ requireApproval: false, defaultDeliveryFee: 3000, maxMenuItems: 50 }),
}));
vi.mock("../modules/restaurant/restaurant.service.js", () => ({
  getRestaurants: vi.fn(),
  getRestaurantById: vi.fn(),
  getRestaurantMenu: vi.fn(),
  createRestaurant: vi.fn(),
  updateRestaurant: vi.fn(),
  toggleRestaurantStatus: vi.fn(),
  setRestaurantStatusAndNote: vi.fn(),
  addMenuItem: vi.fn(),
  updateMenuItem: vi.fn(),
  toggleMenuItemAvailability: vi.fn(),
  deleteMenuItem: vi.fn(),
  getMenuItemByIdAndRestaurant: vi.fn(),
  getRestaurantByIdAndOwner: vi.fn(),
  getRestaurantWithCache: vi.fn(),
  getRestaurantAnalyticsData: vi.fn(),
}));

const { prisma } = await import("../config/prisma.js");
const svc = await import("../modules/restaurant/restaurant.service.js");
const {
  getMyRestaurant, listRestaurants, getRestaurant, getMenu,
  createNewRestaurant, updateExistingRestaurant, toggleStatus, setRestaurantStatus,
  addNewMenuItem, updateExistingMenuItem, toggleMenuItemStatus, deleteExistingMenuItem,
  getRestaurantAnalytics, getRecommendations, getTrending,
} = await import("../modules/restaurant/restaurant.controller.js");

function mockRes() {
  const r = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r;
}

const baseRestaurant = {
  id: "rest-1", name: "Spice Garden", slug: "spice-garden", cuisines: ["Indian"],
  ownerId: "owner-1", isOpen: true, isApproved: true, suspended: false,
  address: { city: "Delhi", deliveryFee: 3000, deliveryTime: 30, minOrder: 9900 },
  menuItems: [],
};

beforeEach(() => vi.clearAllMocks());

// ── getMyRestaurant ───────────────────────────────────────────────────────────
describe("getMyRestaurant", () => {
  it("returns own restaurant", async () => {
    prisma.restaurant.findFirst.mockResolvedValue({ ...baseRestaurant, _count: { orders: 5 } });
    const req = { user: { userId: "owner-1" } };
    const res = mockRes();
    await getMyRestaurant(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns 404 when owner has no restaurant", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(null);
    const req = { user: { userId: "owner-1" } };
    const res = mockRes();
    await getMyRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 500 on error", async () => {
    prisma.restaurant.findFirst.mockRejectedValue(new Error("DB error"));
    const req = { user: { userId: "owner-1" } };
    const res = mockRes();
    await getMyRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── listRestaurants ───────────────────────────────────────────────────────────
describe("listRestaurants", () => {
  it("returns list of restaurants", async () => {
    svc.getRestaurants.mockResolvedValue({ restaurants: [baseRestaurant], total: 1, page: 1, pages: 1 });
    const req = { query: {} };
    const res = mockRes();
    await listRestaurants(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("passes search and filter params", async () => {
    svc.getRestaurants.mockResolvedValue({ restaurants: [], total: 0, page: 2, pages: 0 });
    const req = { query: { search: "spice", city: "Delhi", page: "2", limit: "5" } };
    const res = mockRes();
    await listRestaurants(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns 500 on error", async () => {
    svc.getRestaurants.mockRejectedValue(new Error("DB error"));
    const req = { query: {} };
    const res = mockRes();
    await listRestaurants(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getRestaurant ─────────────────────────────────────────────────────────────
describe("getRestaurant", () => {
  it("returns restaurant data", async () => {
    svc.getRestaurantWithCache.mockResolvedValue({ ...baseRestaurant, menuItems: [] });
    const req = { params: { id: "rest-1" } };
    const res = mockRes();
    await getRestaurant(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns 404 when restaurant not found", async () => {
    svc.getRestaurantWithCache.mockResolvedValue(null);
    const req = { params: { id: "ghost" } };
    const res = mockRes();
    await getRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 500 on error", async () => {
    svc.getRestaurantWithCache.mockRejectedValue(new Error("Cache error"));
    const req = { params: { id: "rest-1" } };
    const res = mockRes();
    await getRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getMenu ───────────────────────────────────────────────────────────────────
describe("getMenu", () => {
  it("returns menu for public customer (no user)", async () => {
    svc.getRestaurantMenu.mockResolvedValue({ id: "rest-1", menuItems: [] });
    const req = { params: { id: "rest-1" }, user: null };
    const res = mockRes();
    await getMenu(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns menu with all items for ADMIN", async () => {
    svc.getRestaurantMenu.mockResolvedValue({ id: "rest-1", menuItems: [] });
    const req = { params: { id: "rest-1" }, user: { role: "ADMIN", userId: "admin-1" } };
    const res = mockRes();
    await getMenu(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns public menu for RESTAURANT user who does NOT own the restaurant", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(null); // not the owner
    svc.getRestaurantMenu.mockResolvedValue({ id: "rest-1", menuItems: [] });
    const req = { params: { id: "rest-1" }, user: { role: "RESTAURANT", userId: "other-1" } };
    const res = mockRes();
    await getMenu(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(svc.getRestaurantMenu).toHaveBeenCalledWith("rest-1", false);
  });

  it("returns full menu for RESTAURANT user who owns the restaurant", async () => {
    prisma.restaurant.findFirst.mockResolvedValue({ id: "rest-1" });
    svc.getRestaurantMenu.mockResolvedValue({ id: "rest-1", menuItems: [] });
    const req = { params: { id: "rest-1" }, user: { role: "RESTAURANT", userId: "owner-1" } };
    const res = mockRes();
    await getMenu(req, res);
    expect(svc.getRestaurantMenu).toHaveBeenCalledWith("rest-1", true);
  });

  it("returns 404 when restaurant not found", async () => {
    svc.getRestaurantMenu.mockResolvedValue(null);
    const req = { params: { id: "ghost" }, user: null };
    const res = mockRes();
    await getMenu(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 400 when id is missing", async () => {
    const req = { params: {}, user: null };
    const res = mockRes();
    await getMenu(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 500 on error", async () => {
    svc.getRestaurantMenu.mockRejectedValue(new Error("DB error"));
    const req = { params: { id: "rest-1" }, user: null };
    const res = mockRes();
    await getMenu(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── createNewRestaurant ───────────────────────────────────────────────────────
describe("createNewRestaurant", () => {
  const validBody = {
    name: "New Kitchen",
    cuisines: ["Italian"],
    city: "Mumbai",
    deliveryFee: 3000,
    deliveryTime: 30,
    minOrder: 9900,
  };

  it("creates restaurant and returns 201", async () => {
    svc.createRestaurant.mockResolvedValue({ ...baseRestaurant, id: "rest-new" });
    const req = { body: validBody, user: { userId: "owner-1" } };
    const res = mockRes();
    await createNewRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("returns 400 on validation error (missing name)", async () => {
    const req = { body: { ...validBody, name: "" }, user: { userId: "owner-1" } };
    const res = mockRes();
    await createNewRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 on validation error (missing cuisines)", async () => {
    const req = { body: { ...validBody, cuisines: [] }, user: { userId: "owner-1" } };
    const res = mockRes();
    await createNewRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 500 on DB error", async () => {
    svc.createRestaurant.mockRejectedValue(new Error("DB error"));
    const req = { body: validBody, user: { userId: "owner-1" } };
    const res = mockRes();
    await createNewRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── updateExistingRestaurant ──────────────────────────────────────────────────
describe("updateExistingRestaurant", () => {
  it("updates restaurant and returns message", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.updateRestaurant.mockResolvedValue({ ...baseRestaurant, name: "Updated" });
    prisma.restaurant.findUnique.mockResolvedValue({ slug: "spice-garden" });

    const req = { params: { id: "rest-1" }, body: { name: "Updated" }, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await updateExistingRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("updated") }));
  });

  it("returns 403 when user does not own restaurant", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(null);
    const req = { params: { id: "rest-1" }, body: { name: "X" }, user: { userId: "other-1", role: "RESTAURANT" } };
    const res = mockRes();
    await updateExistingRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("allows admin to update any restaurant", async () => {
    svc.updateRestaurant.mockResolvedValue({ ...baseRestaurant, name: "Admin Updated" });
    prisma.restaurant.findUnique.mockResolvedValue({ slug: "spice-garden" });

    const req = { params: { id: "rest-1" }, body: { name: "Admin Updated" }, user: { userId: "admin-1", role: "ADMIN" } };
    const res = mockRes();
    await updateExistingRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 400 on validation error", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    const req = { params: { id: "rest-1" }, body: { deliveryFee: -1 }, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await updateExistingRestaurant(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── toggleStatus ──────────────────────────────────────────────────────────────
describe("toggleStatus", () => {
  it("toggles restaurant open/close status", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.toggleRestaurantStatus.mockResolvedValue({ ...baseRestaurant, isOpen: false });
    prisma.restaurant.findUnique.mockResolvedValue({ slug: "spice-garden" });

    const req = { params: { id: "rest-1" }, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await toggleStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  it("returns 403 when not owner", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(null);
    const req = { params: { id: "rest-1" }, user: { userId: "other-1", role: "RESTAURANT" } };
    const res = mockRes();
    await toggleStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("allows admin to toggle any restaurant", async () => {
    svc.toggleRestaurantStatus.mockResolvedValue({ ...baseRestaurant, isOpen: false });
    prisma.restaurant.findUnique.mockResolvedValue({ slug: "spice-garden" });
    const req = { params: { id: "rest-1" }, user: { userId: "admin-1", role: "ADMIN" } };
    const res = mockRes();
    await toggleStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ── setRestaurantStatus ───────────────────────────────────────────────────────
describe("setRestaurantStatus", () => {
  it("sets open status and note", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.setRestaurantStatusAndNote.mockResolvedValue({ ...baseRestaurant, isOpen: false, statusNote: "Closed today" });

    const req = {
      params: { id: "rest-1" },
      body: { isOpen: false, statusNote: "Closed today" },
      user: { userId: "owner-1", role: "RESTAURANT" },
    };
    const res = mockRes();
    await setRestaurantStatus(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns 403 when not owner", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(null);
    const req = { params: { id: "rest-1" }, body: {}, user: { userId: "other", role: "RESTAURANT" } };
    const res = mockRes();
    await setRestaurantStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── addNewMenuItem ────────────────────────────────────────────────────────────
describe("addNewMenuItem", () => {
  const validItem = { name: "Pizza", price: 25000, category: "Main", isVeg: true };

  it("creates menu item and returns 201", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.addMenuItem.mockResolvedValue({ id: "mi-1", ...validItem, restaurantId: "rest-1" });
    prisma.restaurant.findUnique.mockResolvedValue({ slug: "spice-garden" });

    const req = { params: { id: "rest-1" }, body: validItem, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await addNewMenuItem(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("returns 400 on validation error (missing name)", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    const req = { params: { id: "rest-1" }, body: { price: 25000, category: "Main" }, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await addNewMenuItem(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 403 when not owner", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(null);
    const req = { params: { id: "rest-1" }, body: validItem, user: { userId: "other", role: "RESTAURANT" } };
    const res = mockRes();
    await addNewMenuItem(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("admin can add to any restaurant", async () => {
    svc.addMenuItem.mockResolvedValue({ id: "mi-1", ...validItem, restaurantId: "rest-1" });
    prisma.restaurant.findUnique.mockResolvedValue({ slug: "spice-garden" });
    const req = { params: { id: "rest-1" }, body: validItem, user: { userId: "admin-1", role: "ADMIN" } };
    const res = mockRes();
    await addNewMenuItem(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ── updateExistingMenuItem ────────────────────────────────────────────────────
describe("updateExistingMenuItem", () => {
  const validUpdate = { name: "Updated Pizza", price: 30000, category: "Main", isVeg: true };

  it("updates menu item and returns message", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.getMenuItemByIdAndRestaurant.mockResolvedValue({ id: "mi-1", name: "Pizza" });
    svc.updateMenuItem.mockResolvedValue({ id: "mi-1", ...validUpdate });
    prisma.restaurant.findUnique.mockResolvedValue({ slug: "spice-garden" });

    const req = {
      params: { id: "rest-1", itemId: "mi-1" },
      body: validUpdate,
      user: { userId: "owner-1", role: "RESTAURANT" },
    };
    const res = mockRes();
    await updateExistingMenuItem(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("updated") }));
  });

  it("returns 404 when item not found", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.getMenuItemByIdAndRestaurant.mockResolvedValue(null);
    const req = { params: { id: "rest-1", itemId: "ghost" }, body: validUpdate, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await updateExistingMenuItem(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when not owner", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(null);
    const req = { params: { id: "rest-1", itemId: "mi-1" }, body: {}, user: { userId: "other", role: "RESTAURANT" } };
    const res = mockRes();
    await updateExistingMenuItem(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── toggleMenuItemStatus ──────────────────────────────────────────────────────
describe("toggleMenuItemStatus", () => {
  it("toggles menu item availability", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.getMenuItemByIdAndRestaurant.mockResolvedValue({ id: "mi-1", isAvailable: true });
    svc.toggleMenuItemAvailability.mockResolvedValue({ id: "mi-1", isAvailable: false });
    prisma.restaurant.findUnique.mockResolvedValue({ slug: "spice-garden" });

    const req = { params: { id: "rest-1", itemId: "mi-1" }, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await toggleMenuItemStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
  });

  it("returns 404 when item not found", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.getMenuItemByIdAndRestaurant.mockResolvedValue(null);
    const req = { params: { id: "rest-1", itemId: "ghost" }, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await toggleMenuItemStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when not owner", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(null);
    const req = { params: { id: "rest-1", itemId: "mi-1" }, user: { userId: "other", role: "RESTAURANT" } };
    const res = mockRes();
    await toggleMenuItemStatus(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ── deleteExistingMenuItem ────────────────────────────────────────────────────
describe("deleteExistingMenuItem", () => {
  it("deletes menu item and returns message", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.getMenuItemByIdAndRestaurant.mockResolvedValue({ id: "mi-1", restaurantId: "rest-1" });
    svc.deleteMenuItem.mockResolvedValue({ id: "mi-1" });
    prisma.restaurant.findUnique.mockResolvedValue({ slug: "spice-garden" });

    const req = { params: { id: "rest-1", itemId: "mi-1" }, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await deleteExistingMenuItem(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("deleted") }));
  });

  it("returns 403 when not owner", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(null);
    const req = { params: { id: "rest-1", itemId: "mi-1" }, user: { userId: "other", role: "RESTAURANT" } };
    const res = mockRes();
    await deleteExistingMenuItem(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 404 when item not found", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.getMenuItemByIdAndRestaurant.mockResolvedValue(null);

    const req = { params: { id: "rest-1", itemId: "ghost" }, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await deleteExistingMenuItem(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── getRestaurantAnalytics ────────────────────────────────────────────────────
describe("getRestaurantAnalytics", () => {
  it("returns analytics for owner", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.getRestaurantAnalyticsData.mockResolvedValue({ revenue: 100000, orders: 5 });
    const req = { params: { id: "rest-1" }, query: { range: "week" }, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await getRestaurantAnalytics(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns 403 when not owner", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(null);
    const req = { params: { id: "rest-1" }, query: {}, user: { userId: "other-1", role: "RESTAURANT" } };
    const res = mockRes();
    await getRestaurantAnalytics(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("admin skips ownership check", async () => {
    svc.getRestaurantAnalyticsData.mockResolvedValue({ revenue: 200000, orders: 10 });
    const req = { params: { id: "rest-1" }, query: { range: "month" }, user: { userId: "admin-1", role: "ADMIN" } };
    const res = mockRes();
    await getRestaurantAnalytics(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns 500 on error", async () => {
    svc.getRestaurantByIdAndOwner.mockResolvedValue(baseRestaurant);
    svc.getRestaurantAnalyticsData.mockRejectedValue(new Error("DB error"));
    const req = { params: { id: "rest-1" }, query: {}, user: { userId: "owner-1", role: "RESTAURANT" } };
    const res = mockRes();
    await getRestaurantAnalytics(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getRecommendations ────────────────────────────────────────────────────────
describe("getRecommendations", () => {
  it("falls through to trending when user is not authenticated", async () => {
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.restaurant.findMany.mockResolvedValue([baseRestaurant]);
    const req = { user: null };
    const res = mockRes();
    await getRecommendations(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ restaurants: expect.any(Array) }));
  });

  it("returns personalised recommendations for authenticated user", async () => {
    prisma.order.findMany.mockResolvedValue([
      { restaurantId: "rest-old", restaurant: { cuisines: ["Indian"], id: "rest-old" } },
    ]);
    prisma.favorite.findMany.mockResolvedValue([]);
    prisma.restaurant.findMany.mockResolvedValue([baseRestaurant]);
    const req = { user: { userId: "u-1" } };
    const res = mockRes();
    await getRecommendations(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ restaurants: expect.any(Array) }));
  });

  it("falls back to top-rated when too few recommendations", async () => {
    prisma.order.findMany.mockResolvedValue([]);
    prisma.favorite.findMany.mockResolvedValue([]);
    prisma.restaurant.findMany
      .mockResolvedValueOnce([]) // initial recommendation query returns empty
      .mockResolvedValueOnce([baseRestaurant]); // fallback returns something
    const req = { user: { userId: "u-1" } };
    const res = mockRes();
    await getRecommendations(req, res);
    expect(res.json).toHaveBeenCalled();
  });

  it("returns 500 on error", async () => {
    prisma.order.findMany.mockRejectedValue(new Error("DB error"));
    const req = { user: { userId: "u-1" } };
    const res = mockRes();
    await getRecommendations(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ── getTrending ───────────────────────────────────────────────────────────────
describe("getTrending", () => {
  it("returns trending restaurants sorted by order count", async () => {
    prisma.order.groupBy.mockResolvedValue([
      { restaurantId: "rest-1", _count: { id: 10 } },
    ]);
    prisma.restaurant.findMany.mockResolvedValue([baseRestaurant]);
    const req = { user: null };
    const res = mockRes();
    await getTrending(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ restaurants: expect.any(Array) }));
  });

  it("falls back to top-rated when no orders in last 7 days", async () => {
    prisma.order.groupBy.mockResolvedValue([]);
    prisma.restaurant.findMany.mockResolvedValue([baseRestaurant]);
    const req = { user: null };
    const res = mockRes();
    await getTrending(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ restaurants: expect.any(Array) }));
  });

  it("returns 500 on error", async () => {
    prisma.order.groupBy.mockRejectedValue(new Error("DB error"));
    const req = { user: null };
    const res = mockRes();
    await getTrending(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
