/**
 * Restaurant service tests — approval flow, suspension filtering, ownership.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../config/prisma.js", () => ({
  prisma: {
    restaurant: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("../config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-at-least-32-chars-here",
    JWT_REFRESH_SECRET: "test-refresh-secret-32-chars-here",
    CASHFREE_APP_ID: "test",
    CASHFREE_SECRET_KEY: "test",
    CASHFREE_ENV: "sandbox",
    FRONTEND_URL: "http://localhost:3000",
    BACKEND_URL: "http://localhost:5000",
    ALLOWED_ORIGINS: "http://localhost:3000",
    PORT: 5000,
  },
}));

vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../utils/cache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDelete: vi.fn().mockResolvedValue(undefined),
  cacheOrFetch: vi.fn().mockImplementation(async (_k, fn) => fn()),
  CACHE_KEYS: { ANALYTICS: (id, r) => `analytics:${id}:${r}` },
  CACHE_TTL: { ANALYTICS: 300 },
}));

vi.mock("../modules/config/config.service.js", () => ({
  getSiteConfigCached: vi.fn().mockResolvedValue({ requireApproval: false, maxMenuItems: 50 }),
}));

const { getRestaurantById, getRestaurantByIdAndOwner, createRestaurant, geocodeAddress } = await import(
  "../modules/restaurant/restaurant.service.js"
);
const { prisma } = await import("../config/prisma.js");

const MOCK_RESTAURANT = {
  id: "rest-1",
  name: "Pizza Palace",
  slug: "pizza-palace",
  ownerId: "owner-1",
  suspended: false,
  isApproved: true,
  menuItems: [],
  owner: { id: "owner-1", name: "Owner", email: "owner@x.com", phone: null },
};

describe("getRestaurantById", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns an approved, non-suspended restaurant", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(MOCK_RESTAURANT);
    const result = await getRestaurantById("rest-1");
    expect(result).not.toBeNull();
    expect(result.id).toBe("rest-1");
  });

  it("includes suspended:false and isApproved:true in the WHERE clause", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(null);
    await getRestaurantById("rest-1");

    const call = prisma.restaurant.findFirst.mock.calls[0][0];
    expect(call.where).toMatchObject({ suspended: false, isApproved: true });
  });

  it("returns null for a suspended restaurant (query returns null)", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(null);
    const result = await getRestaurantById("rest-suspended");
    expect(result).toBeNull();
  });
});

describe("getRestaurantByIdAndOwner", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the restaurant when ownerId matches", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(MOCK_RESTAURANT);
    const result = await getRestaurantByIdAndOwner("rest-1", "owner-1");
    expect(result).not.toBeNull();
  });

  it("passes ownerId in the WHERE clause", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(null);
    await getRestaurantByIdAndOwner("rest-1", "owner-2");

    const call = prisma.restaurant.findFirst.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "rest-1", ownerId: "owner-2" });
  });

  it("returns null when ownerId does not match (cross-restaurant access blocked)", async () => {
    prisma.restaurant.findFirst.mockResolvedValue(null);
    const result = await getRestaurantByIdAndOwner("rest-1", "attacker");
    expect(result).toBeNull();
  });
});

describe("createRestaurant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a restaurant and respects requireApproval=false", async () => {
    prisma.restaurant.create.mockResolvedValue({ ...MOCK_RESTAURANT, isApproved: true });

    const result = await createRestaurant(
      { name: "New Place", cuisines: ["Indian"], city: "Delhi", deliveryFee: 3000, deliveryTime: 30, minOrder: 20000 },
      "owner-1"
    );

    expect(result.id).toBe("rest-1");
    expect(prisma.restaurant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isApproved: true }),
      })
    );
  });

  it("sets isApproved=false when requireApproval=true", async () => {
    const { getSiteConfigCached } = await import("../modules/config/config.service.js");
    getSiteConfigCached.mockResolvedValueOnce({ requireApproval: true, maxMenuItems: 50 });

    prisma.restaurant.create.mockResolvedValue({ ...MOCK_RESTAURANT, isApproved: false });

    await createRestaurant(
      { name: "Pending Place", cuisines: [], city: "Mumbai", deliveryFee: 2000, deliveryTime: 45, minOrder: 15000 },
      "owner-2"
    );

    expect(prisma.restaurant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isApproved: false }),
      })
    );
  });
});

// Regression for Bug D: geocodeAddress must NEVER resolve to a 0/0 (or any
// other sentinel numeric) fallback on failure — only null, so callers can
// never accidentally persist a fake location. Mocks global.fetch directly
// rather than hitting the real Nominatim API.
describe("geocodeAddress", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns null (not 0,0) when the geocoding request errors", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await geocodeAddress("Bahadurgarh, India");
    expect(result).toBeNull();
  });

  it("returns null (not 0,0) when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    const result = await geocodeAddress("Bahadurgarh, India");
    expect(result).toBeNull();
  });

  it("returns null (not 0,0) when there are no geocoding results", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    const result = await geocodeAddress("Nonexistent Place Xyz");
    expect(result).toBeNull();
  });

  it("returns real coordinates (not 0,0) on a successful lookup", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ lat: "28.6953", lon: "76.9279" }],
    });
    const result = await geocodeAddress("Bahadurgarh, India");
    expect(result).toEqual({ lat: 28.6953, lng: 76.9279 });
  });
});
