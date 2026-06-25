/**
 * Orders service extended tests
 * Covers: listOrders, getOrderById, createOrder, calculateOrderTotal
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/env.js", () => ({
  env: { JWT_SECRET: "test-secret-32-chars-here-padding" },
}));
vi.mock("../utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../config/prisma.js", () => ({
  prisma: {
    order: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    restaurant: { findUnique: vi.fn() },
    menuItem: { findMany: vi.fn() },
    coupon: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("../modules/config/config.service.js", () => ({
  getSiteConfigCached: vi.fn(),
}));
// Default PlatformSettings (₹10 base, ₹2/km, ₹5 flat platform fee, 20/50/30
// split) — matches the schema's @default values exactly, so these tests
// exercise the real defaults rather than an arbitrary test fixture.
vi.mock("../modules/pricing/platformSettings.service.js", () => ({
  getPlatformSettingsCached: vi.fn().mockResolvedValue({
    deliveryBaseFee: 1000,
    deliveryPerKmFee: 200,
    platformFeeMode: "FLAT",
    platformFeeValue: 500,
    splitRestaurantPct: 20,
    splitRiderPct: 50,
    splitAdminPct: 30,
  }),
  snapshotSettings: vi.fn((s) => ({ ...s })),
}));
vi.mock("../utils/eta.js", () => ({
  computeETA: vi.fn(() => new Date(Date.now() + 30 * 60_000)),
}));
vi.mock("../socket/socketServer.js", () => ({
  getIO: vi.fn(),
  emitToAll: vi.fn(),
}));
vi.mock("../socket/socket.server.js", () => ({
  emitOrderNew: vi.fn(),
}));
vi.mock("../modules/notification/notification.service.js", () => ({
  createNotification: vi.fn(),
}));
const mockClaimPointsInTx = vi.fn();
vi.mock("../modules/wallet/wallet.service.js", () => ({
  claimPointsInTx: mockClaimPointsInTx,
}));

const { prisma } = await import("../config/prisma.js");
const { getSiteConfigCached } = await import("../modules/config/config.service.js");
const { getPlatformSettingsCached } = await import("../modules/pricing/platformSettings.service.js");
const { listOrders, getOrderById, createOrder, calculateOrderTotal } = await import("../modules/orders/orders.service.js");

const baseCfg = { defaultDeliveryFee: 3000, cashOnDelivery: true, codMinOrder: 0, autoConfirmOrders: false };

const baseOrder = {
  id: "ord-1",
  customerId: "u-1",
  restaurantId: "rest-1",
  status: "PLACED",
  subtotal: 50000,
  deliveryFee: 3000,
  discount: 0,
  total: 53000,
  restaurant: { id: "rest-1", name: "Spice Garden" },
  agent: null,
  estimatedDelivery: null,
  placedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  getSiteConfigCached.mockResolvedValue(baseCfg);
});

// ── listOrders ────────────────────────────────────────────────────────────────
describe("listOrders", () => {
  it("returns serialized orders for a customer", async () => {
    prisma.order.findMany.mockResolvedValue([baseOrder]);

    const result = await listOrders("u-1");

    expect(result).toHaveLength(1);
    expect(result[0].total).toBe(53000); // numeric
    expect(typeof result[0].subtotal).toBe("number");
  });

  it("uses pagination parameters", async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await listOrders("u-1", { page: 2, limit: 10 });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10, skip: 10 })
    );
  });

  it("clamps limit to 100", async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await listOrders("u-1", { limit: 9999 });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it("passes null customerId when fetching all orders (admin)", async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await listOrders(null);

    const call = prisma.order.findMany.mock.calls[0][0];
    expect(call.where).toBeUndefined();
  });
});

// ── getOrderById ──────────────────────────────────────────────────────────────
describe("getOrderById", () => {
  it("returns a serialized order", async () => {
    prisma.order.findUnique.mockResolvedValue(baseOrder);

    const result = await getOrderById("ord-1");

    expect(result.id).toBe("ord-1");
    expect(typeof result.total).toBe("number");
  });

  it("returns null when order not found", async () => {
    prisma.order.findUnique.mockResolvedValue(null);

    const result = await getOrderById("ghost");

    expect(result).toBeNull();
  });
});

// ── createOrder ───────────────────────────────────────────────────────────────
describe("createOrder", () => {
  const menuItems = [
    { id: "mi-1", price: 25000, restaurantId: "rest-1", isAvailable: true },
    { id: "mi-2", price: 15000, restaurantId: "rest-1", isAvailable: true },
  ];

  const payload = {
    restaurantId: "rest-1",
    items: [{ menuItemId: "mi-1", quantity: 2 }, { menuItemId: "mi-2", quantity: 1 }],
    deliveryAddress: { street: "1 Road", city: "Delhi", state: "DL", postalCode: "110001" },
  };

  it("throws when restaurant not found", async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);

    await expect(createOrder(payload, "u-1")).rejects.toThrow("Restaurant not found");
  });

  it("throws when restaurant is not open", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ isOpen: false, suspended: false, isApproved: true });

    await expect(createOrder(payload, "u-1")).rejects.toThrow(/not accepting/i);
  });

  it("throws when restaurant is suspended", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ isOpen: true, suspended: true, isApproved: true });

    await expect(createOrder(payload, "u-1")).rejects.toThrow("Restaurant not found");
  });

  it("throws when restaurant is not approved", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ isOpen: true, suspended: false, isApproved: false });

    await expect(createOrder(payload, "u-1")).rejects.toThrow("Restaurant not found");
  });

  it("throws when menu items not found", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ isOpen: true, suspended: false, isApproved: true });
    prisma.menuItem.findMany.mockResolvedValue([]); // empty

    await expect(createOrder(payload, "u-1")).rejects.toThrow();
  });

  it("throws when a menu item belongs to a different restaurant", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ isOpen: true, suspended: false, isApproved: true });
    prisma.menuItem.findMany.mockResolvedValue([
      { id: "mi-1", price: 25000, restaurantId: "other-rest", isAvailable: true },
    ]);

    await expect(createOrder(payload, "u-1")).rejects.toThrow();
  });

  it("creates order with correct totals when valid", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ isOpen: true, suspended: false, isApproved: true, address: { minOrder: 9900 } });
    prisma.menuItem.findMany.mockResolvedValue(menuItems);
    getSiteConfigCached.mockResolvedValue({ ...baseCfg, defaultDeliveryFee: 3000 });
    const order = { ...baseOrder, total: 68000 };
    prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        coupon: { findUnique: vi.fn(), updateMany: vi.fn() },
        order: { create: vi.fn().mockResolvedValue(order) },
      };
      return fn(tx);
    });

    const result = await createOrder(payload, "u-1");

    expect(result.total).toBe(68000);
  });

  it("computes each order from the PlatformSettings live AT CREATION TIME — a later settings change never retroactively alters an already-created order's stored breakdown", async () => {
    prisma.restaurant.findUnique.mockResolvedValue({ isOpen: true, suspended: false, isApproved: true, address: { minOrder: 9900 } });
    prisma.menuItem.findMany.mockResolvedValue(menuItems);
    getSiteConfigCached.mockResolvedValue({ ...baseCfg, defaultDeliveryFee: 3000 });

    let capturedCreateData;
    prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        coupon: { findUnique: vi.fn(), updateMany: vi.fn() },
        order: {
          create: vi.fn((args) => {
            capturedCreateData = args.data;
            return Promise.resolve({ ...baseOrder, ...args.data });
          }),
        },
      };
      return fn(tx);
    });

    // "Today's" settings — order 1 created under these.
    getPlatformSettingsCached.mockResolvedValue({
      deliveryBaseFee: 1000, deliveryPerKmFee: 200,
      platformFeeMode: "FLAT", platformFeeValue: 500,
      splitRestaurantPct: 20, splitRiderPct: 50, splitAdminPct: 30,
    });
    await createOrder(payload, "u-1");
    const order1Snapshot = capturedCreateData.pricingSnapshot;
    const order1RiderPayout = capturedCreateData.riderPayout;
    const order1AdminRevenue = capturedCreateData.adminRevenue;

    // Admin changes the split "tomorrow" — order 2 created under the new settings.
    getPlatformSettingsCached.mockResolvedValue({
      deliveryBaseFee: 1000, deliveryPerKmFee: 200,
      platformFeeMode: "FLAT", platformFeeValue: 500,
      splitRestaurantPct: 50, splitRiderPct: 20, splitAdminPct: 30,
    });
    await createOrder(payload, "u-1");
    const order2Snapshot = capturedCreateData.pricingSnapshot;
    const order2RiderPayout = capturedCreateData.riderPayout;

    // The two orders' stored payouts genuinely differ (proving the split is
    // really applied at creation time, not some cached/frozen constant)...
    expect(order1RiderPayout).not.toBe(order2RiderPayout);
    expect(order1RiderPayout).toBeGreaterThan(order2RiderPayout); // 50% > 20% of the same pool
    // ...and each order's own snapshot reflects exactly the settings that
    // were live when IT was created, not whatever is live now.
    expect(order1Snapshot.splitRiderPct).toBe(50);
    expect(order2Snapshot.splitRiderPct).toBe(20);
    // Since nothing ever re-reads PlatformSettings to recompute an existing
    // order, order 1's already-returned riderPayout/adminRevenue are exactly
    // what got persisted — there is no code path that would later overwrite
    // them when settings change again.
    expect(order1AdminRevenue).toBe(order2AdminRevenueUnchangedSanity(order1Snapshot));

    function order2AdminRevenueUnchangedSanity(snapshot) {
      // Recompute order 1's expected adminRevenue directly from its own
      // frozen snapshot, independent of whatever getPlatformSettingsCached
      // returns now — this is what "immutable" means here.
      const splitPool = 1000 + 500; // deliveryFee (base only, no distance) + platformFee
      const restaurantShare = Math.round(splitPool * (snapshot.splitRestaurantPct / 100));
      const riderShare = Math.round(splitPool * (snapshot.splitRiderPct / 100));
      return splitPool - restaurantShare - riderShare;
    }
  });
});

// ── createOrder — loyalty points redemption ────────────────────────────────────
describe("createOrder — loyalty points redemption", () => {
  const menuItems = [{ id: "mi-1", price: 100000, restaurantId: "rest-1", isAvailable: true }]; // ₹1000 item

  const basePayload = {
    restaurantId: "rest-1",
    items: [{ menuItemId: "mi-1", quantity: 1 }],
    deliveryAddress: { street: "1 Road", city: "Delhi", state: "DL", postalCode: "110001" },
  };

  function setupTx({ walletBalance }) {
    let capturedCreateData;
    let capturedClaim;
    prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        coupon: { findUnique: vi.fn(), updateMany: vi.fn() },
        wallet: { upsert: vi.fn().mockResolvedValue({ id: "wallet-1", userId: "u-1", balance: walletBalance }) },
        order: {
          create: vi.fn((args) => {
            capturedCreateData = args.data;
            return Promise.resolve({ ...baseOrder, ...args.data, id: "ord-redeem-1" });
          }),
        },
      };
      mockClaimPointsInTx.mockImplementation(async (_tx, _userId, points, opts) => {
        capturedClaim = { points, ...opts };
      });
      const result = await fn(tx);
      return result;
    });
    return { getCapturedCreateData: () => capturedCreateData, getCapturedClaim: () => capturedClaim };
  }

  beforeEach(() => {
    prisma.restaurant.findUnique.mockResolvedValue({ isOpen: true, suspended: false, isApproved: true, address: { minOrder: 0 } });
    prisma.menuItem.findMany.mockResolvedValue(menuItems);
    getSiteConfigCached.mockResolvedValue(baseCfg);
    getPlatformSettingsCached.mockResolvedValue({
      deliveryBaseFee: 1000, deliveryPerKmFee: 200,
      platformFeeMode: "FLAT", platformFeeValue: 500,
      splitRestaurantPct: 20, splitRiderPct: 50, splitAdminPct: 30,
      loyaltyEarnRate: 0.1, loyaltyPointValuePaise: 100, loyaltyRedemptionCapPct: 20,
    });
  });

  it("applies the full requested redemption when within both balance and the cap", async () => {
    const { getCapturedCreateData, getCapturedClaim } = setupTx({ walletBalance: 50 });
    await createOrder({ ...basePayload, pointsToRedeem: 50 }, "u-1");

    const claim = getCapturedClaim();
    expect(claim.points).toBe(50);
    expect(getCapturedCreateData().discount).toBeGreaterThanOrEqual(5000); // 50 points * ₹1 = ₹50 = 5000 paise
  });

  it("caps redemption at the wallet's real balance, not the requested amount", async () => {
    const { getCapturedClaim } = setupTx({ walletBalance: 10 });
    await createOrder({ ...basePayload, pointsToRedeem: 9999 }, "u-1");

    expect(getCapturedClaim().points).toBe(10);
  });

  it("caps redemption at the admin-configured % of order value even with a large balance", async () => {
    // Order total is ~₹1000+ fees; 20% cap means redemption can't exceed
    // roughly ₹200-worth of points regardless of how many points are owned.
    const { getCapturedClaim } = setupTx({ walletBalance: 100000 });
    await createOrder({ ...basePayload, pointsToRedeem: 100000 }, "u-1");

    const claim = getCapturedClaim();
    expect(claim.points).toBeLessThan(100000);
    expect(claim.points).toBeGreaterThan(0);
  });

  it("does not touch the wallet at all when pointsToRedeem is omitted", async () => {
    prisma.$transaction.mockImplementation(async (fn) => {
      const tx = {
        coupon: { findUnique: vi.fn(), updateMany: vi.fn() },
        wallet: { upsert: vi.fn() },
        order: { create: vi.fn().mockResolvedValue({ ...baseOrder, id: "ord-no-redeem" }) },
      };
      return fn(tx);
    });

    await createOrder(basePayload, "u-1");

    expect(mockClaimPointsInTx).not.toHaveBeenCalled();
  });
});

// ── calculateOrderTotal ───────────────────────────────────────────────────────
describe("calculateOrderTotal", () => {
  const menuItems = [
    { id: "mi-1", price: 20000, restaurantId: "rest-1", isAvailable: true, name: "Pizza", description: "" },
  ];

  it("calculates total without coupon", async () => {
    prisma.menuItem.findMany.mockResolvedValue(menuItems);
    getSiteConfigCached.mockResolvedValue(baseCfg);

    const result = await calculateOrderTotal({
      restaurantId: "rest-1",
      items: [{ menuItemId: "mi-1", quantity: 2 }],
    });

    // itemTotal 40000; +2.5% packaging (1000) +2.5% GST (1000)
    // +deliveryFee 1000 (base only, no distance) +5% GST (50)
    // +platformFee 500 flat +5% GST (25) = 43575
    expect(result.subtotal).toBe(40000); // 2 × 20000
    expect(result.total).toBe(43575);
    expect(result.discount).toBe(0);
  });

  it("applies PERCENTAGE coupon correctly", async () => {
    prisma.menuItem.findMany.mockResolvedValue(menuItems);
    getSiteConfigCached.mockResolvedValue(baseCfg);
    const coupon = {
      id: "c-1", code: "SAVE10", isActive: true,
      expiresAt: new Date(Date.now() + 86400_000),
      usedCount: 0, maxUses: 100,
      discountType: "PERCENTAGE", discountValue: "10",
      minOrder: "0", restaurantId: null,
    };
    prisma.coupon.findUnique.mockResolvedValue(coupon);

    const result = await calculateOrderTotal({
      restaurantId: "rest-1",
      items: [{ menuItemId: "mi-1", quantity: 2 }],
      couponCode: "SAVE10",
    });

    expect(result.discount).toBe(4000); // 10% of 40000
    expect(result.total).toBe(39575); // 43575 customerTotal - 4000 discount
  });

  it("applies FLAT coupon correctly", async () => {
    prisma.menuItem.findMany.mockResolvedValue(menuItems);
    getSiteConfigCached.mockResolvedValue(baseCfg);
    const coupon = {
      id: "c-2", code: "FLAT50", isActive: true,
      expiresAt: new Date(Date.now() + 86400_000),
      usedCount: 0, maxUses: 100,
      discountType: "FLAT", discountValue: "5000",
      minOrder: "0", restaurantId: null,
    };
    prisma.coupon.findUnique.mockResolvedValue(coupon);

    const result = await calculateOrderTotal({
      restaurantId: "rest-1",
      items: [{ menuItemId: "mi-1", quantity: 2 }],
      couponCode: "FLAT50",
    });

    expect(result.discount).toBe(5000);
    expect(result.total).toBe(38575); // 43575 customerTotal - 5000 discount
  });

  it("throws when coupon is invalid", async () => {
    prisma.menuItem.findMany.mockResolvedValue(menuItems);
    getSiteConfigCached.mockResolvedValue(baseCfg);
    prisma.coupon.findUnique.mockResolvedValue(null);

    await expect(
      calculateOrderTotal({ restaurantId: "rest-1", items: [{ menuItemId: "mi-1", quantity: 1 }], couponCode: "BADCODE" })
    ).rejects.toThrow();
  });

  it("throws when coupon is expired", async () => {
    prisma.menuItem.findMany.mockResolvedValue(menuItems);
    getSiteConfigCached.mockResolvedValue(baseCfg);
    prisma.coupon.findUnique.mockResolvedValue({
      id: "c-3", isActive: true,
      expiresAt: new Date(Date.now() - 1000),
      usedCount: 0, maxUses: 10,
      discountType: "FLAT", discountValue: "500",
      minOrder: "0",
    });

    await expect(
      calculateOrderTotal({ restaurantId: "rest-1", items: [{ menuItemId: "mi-1", quantity: 1 }], couponCode: "EXPIRED" })
    ).rejects.toThrow(/expired/i);
  });

  it("throws when minimum order not met", async () => {
    prisma.menuItem.findMany.mockResolvedValue(menuItems);
    getSiteConfigCached.mockResolvedValue(baseCfg);
    prisma.coupon.findUnique.mockResolvedValue({
      id: "c-4", isActive: true,
      expiresAt: new Date(Date.now() + 86400_000),
      usedCount: 0, maxUses: 10,
      discountType: "FLAT", discountValue: "1000",
      minOrder: "99999", // very high min order
    });

    await expect(
      calculateOrderTotal({ restaurantId: "rest-1", items: [{ menuItemId: "mi-1", quantity: 1 }], couponCode: "MINORDER" })
    ).rejects.toThrow(/minimum order/i);
  });
});
