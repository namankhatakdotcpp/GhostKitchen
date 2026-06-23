/**
 * Role service tests
 * Covers: switchRole, registerRestaurant, addRestaurant, registerRider,
 *         getMyRestaurants, updateMyRestaurant
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: {
    JWT_SECRET: "test-secret-at-least-32-chars-here",
    JWT_REFRESH_SECRET: "test-refresh-at-least-32-chars-here",
  },
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockGenPair = vi.fn(() => ({ accessToken: "test.access.token", refreshToken: "test.refresh.token" }));
const mockBuildPayload = vi.fn((u) => ({ userId: u.id, roles: u.roles }));

vi.mock("../utils/jwt.js", () => ({
  generateTokenPair: mockGenPair,
  buildTokenPayload: mockBuildPayload,
  generateAccessToken: vi.fn(() => "new.access.tok"),
  verifyRefreshToken: vi.fn(),
  hashToken: vi.fn((t) => `hash:${t}`),
}));
vi.mock("../config/prisma.js", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    restaurant: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    menuItem: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../modules/config/config.service.js", () => ({
  getSiteConfigCached: vi.fn(),
  invalidateConfigCache: vi.fn(),
}));

const { prisma } = await import("../config/prisma.js");
const { getSiteConfigCached } = await import("../modules/config/config.service.js");
const { switchRole, registerRestaurant, addRestaurant, registerRider, getMyRestaurants, updateMyRestaurant } = await import("../modules/role/role.service.js");

const baseUser = {
  id: "u-1",
  name: "Alice",
  email: "alice@example.com",
  roles: ["CUSTOMER"],
  activeRole: "CUSTOMER",
  secondRole: null,
  restaurantId: null,
};

const baseCfg = {
  newRestaurantReg: true,
  riderRegistrations: true,
  allowBranches: true,
  maxDeliveryRadius: 20,
  defaultDeliveryFee: 3000,
  requireApproval: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  getSiteConfigCached.mockResolvedValue(baseCfg);
});

// ── switchRole ────────────────────────────────────────────────────────────────
describe("switchRole", () => {
  it("updates activeRole and returns new token", async () => {
    const user = { ...baseUser, roles: ["CUSTOMER", "RESTAURANT"], restaurantId: "r-1" };
    prisma.user.findUnique.mockResolvedValue(user);
    const updated = { ...user, activeRole: "RESTAURANT" };
    prisma.user.update.mockResolvedValue(updated);

    const result = await switchRole("u-1", "RESTAURANT");

    expect(result.activeRole).toBe("RESTAURANT");
    expect(result.token).toBe("test.access.token");
  });

  it("throws 404 when user not found", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(switchRole("nobody", "RESTAURANT")).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 403 when user does not have requested role", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser); // only CUSTOMER

    await expect(switchRole("u-1", "DELIVERY")).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── registerRestaurant ────────────────────────────────────────────────────────
describe("registerRestaurant", () => {
  const restaurantData = {
    name: "Test Kitchen",
    description: "Good food",
    cuisines: ["Indian"],
    deliveryRadius: 5,
  };

  it("throws 403 when new restaurant registrations are disabled", async () => {
    getSiteConfigCached.mockResolvedValue({ ...baseCfg, newRestaurantReg: false });
    prisma.user.findUnique.mockResolvedValue(baseUser);

    await expect(registerRestaurant("u-1", restaurantData)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 404 when user not found", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(registerRestaurant("u-1", restaurantData)).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 409 when user already has a different second role", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, secondRole: "DELIVERY" });
    prisma.restaurant.findMany.mockResolvedValue([]); // no existing restaurants

    await expect(registerRestaurant("u-1", restaurantData)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("throws 400 when restaurant name is missing", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.restaurant.findMany.mockResolvedValue([]);

    await expect(registerRestaurant("u-1", { ...restaurantData, name: "" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 400 when deliveryRadius exceeds max", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.restaurant.findMany.mockResolvedValue([]);

    await expect(registerRestaurant("u-1", { ...restaurantData, deliveryRadius: 999 })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("creates restaurant and returns token on success", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.restaurant.findMany.mockResolvedValue([]);
    const createdRestaurant = { id: "r-new", name: "Test Kitchen" };
    const updatedUser = { ...baseUser, roles: ["CUSTOMER", "RESTAURANT"], secondRole: "RESTAURANT", restaurantId: "r-new" };
    prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        restaurant: { create: vi.fn().mockResolvedValue(createdRestaurant) },
        user: { update: vi.fn().mockResolvedValue(updatedUser) },
        menuItem: { create: vi.fn() },
      };
      return fn(tx);
    });

    const result = await registerRestaurant("u-1", restaurantData);

    expect(result.token).toBe("test.access.token");
    expect(result.restaurant).toEqual(createdRestaurant);
  });

  it("returns existing restaurant idempotently when user already has one", async () => {
    const existingRestaurant = { id: "r-exists", address: { city: "Delhi" } };
    const userWithRestaurant = { ...baseUser, roles: ["CUSTOMER", "RESTAURANT"], secondRole: "RESTAURANT", restaurantId: "r-exists" };
    prisma.user.findUnique.mockResolvedValue(userWithRestaurant);
    prisma.restaurant.findMany.mockResolvedValue([existingRestaurant]);
    prisma.restaurant.findUnique.mockResolvedValue({ id: "r-exists", name: "Old Kitchen" });

    const result = await registerRestaurant("u-1", restaurantData);
    expect(result.restaurant.id).toBe("r-exists");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("heals user record when restaurant exists but user is out of sync", async () => {
    const existingRestaurant = { id: "r-exists", address: { city: "Delhi" } };
    prisma.user.findUnique.mockResolvedValue(baseUser); // no RESTAURANT in roles
    prisma.restaurant.findMany.mockResolvedValue([existingRestaurant]);
    const healed = { ...baseUser, roles: ["CUSTOMER", "RESTAURANT"], secondRole: "RESTAURANT", restaurantId: "r-exists" };
    prisma.user.update.mockResolvedValue(healed);
    prisma.restaurant.findUnique.mockResolvedValue({ id: "r-exists", name: "Old Kitchen" });

    await registerRestaurant("u-1", restaurantData);
    expect(prisma.user.update).toHaveBeenCalledOnce();
  });
});

// ── registerRider ─────────────────────────────────────────────────────────────
describe("registerRider", () => {
  it("throws 403 when rider registrations are disabled", async () => {
    getSiteConfigCached.mockResolvedValue({ ...baseCfg, riderRegistrations: false });
    prisma.user.findUnique.mockResolvedValue(baseUser);

    await expect(registerRider("u-1", {})).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 404 when user not found", async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(registerRider("u-1", {})).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 409 when user already has a second role", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, secondRole: "RESTAURANT" });

    await expect(registerRider("u-1", {})).rejects.toMatchObject({ statusCode: 409 });
  });

  it("registers rider and returns token on success", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    const updated = {
      ...baseUser,
      roles: ["CUSTOMER", "DELIVERY"],
      secondRole: "DELIVERY",
      activeRole: "DELIVERY",
    };
    prisma.user.update.mockResolvedValue(updated);

    const result = await registerRider("u-1", { vehicleType: "BIKE", vehicleNumber: "DL01AB1234" });

    expect(result.token).toBe("test.access.token");
    expect(result.user.secondRole).toBe("DELIVERY");
  });

  it("activates DELIVERY as the active role, not just the roles list (regression: 403 on delivery routes immediately after registration/refresh)", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser);
    prisma.user.update.mockImplementation(async ({ data }) => ({
      ...baseUser,
      ...data,
      roles: data.roles?.set ?? baseUser.roles,
    }));

    await registerRider("u-1", { vehicleType: "BIKE", vehicleNumber: "DL01AB1234" });

    const updateCall = prisma.user.update.mock.calls.at(-1)[0];
    expect(updateCall.data.activeRole).toBe("DELIVERY");

    // buildTokenPayload (mocked above) is called with the row the DB will
    // persist — assert its activeRole is DELIVERY, since that's exactly
    // what /auth/refresh re-reads on every subsequent request.
    const payloadArg = mockBuildPayload.mock.calls.at(-1)[0];
    expect(payloadArg.activeRole).toBe("DELIVERY");
  });
});

// ── addRestaurant ─────────────────────────────────────────────────────────────
describe("addRestaurant", () => {
  it("throws 403 when branches are disabled", async () => {
    getSiteConfigCached.mockResolvedValue({ ...baseCfg, allowBranches: false });
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, roles: ["CUSTOMER", "RESTAURANT"] });

    await expect(addRestaurant("u-1", { name: "Branch" })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 403 when user is not a restaurant owner", async () => {
    prisma.user.findUnique.mockResolvedValue(baseUser); // only CUSTOMER

    await expect(addRestaurant("u-1", { name: "Branch" })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 400 when deliveryRadius exceeds max", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, roles: ["CUSTOMER", "RESTAURANT"] });
    prisma.restaurant.findMany.mockResolvedValue([]);

    await expect(addRestaurant("u-1", { name: "Branch", deliveryRadius: 999, city: "Delhi" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("throws 409 when restaurant already exists in that city", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...baseUser, roles: ["CUSTOMER", "RESTAURANT"] });
    prisma.restaurant.findMany.mockResolvedValue([{ id: "r-1", address: { city: "Delhi" } }]);

    await expect(addRestaurant("u-1", { name: "Branch", city: "Delhi", deliveryRadius: 5 })).rejects.toMatchObject({ statusCode: 409 });
  });
});

// ── getMyRestaurants ──────────────────────────────────────────────────────────
describe("getMyRestaurants", () => {
  it("returns restaurants owned by user", async () => {
    const restaurants = [{ id: "r-1", name: "Kitchen 1", menuItems: [], _count: { orders: 0 } }];
    prisma.restaurant.findMany.mockResolvedValue(restaurants);

    const result = await getMyRestaurants("u-1");
    expect(result).toEqual(restaurants);
    expect(prisma.restaurant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: "u-1" } })
    );
  });
});
