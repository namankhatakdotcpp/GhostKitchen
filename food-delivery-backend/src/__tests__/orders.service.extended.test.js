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

const { prisma } = await import("../config/prisma.js");
const { getSiteConfigCached } = await import("../modules/config/config.service.js");
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

    expect(result.subtotal).toBe(40000); // 2 × 20000
    expect(result.total).toBe(43000); // + 3000 delivery
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
    expect(result.total).toBe(39000); // 40000 - 4000 + 3000
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
    expect(result.total).toBe(38000); // 40000 - 5000 + 3000
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
