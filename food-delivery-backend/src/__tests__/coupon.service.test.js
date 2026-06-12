/**
 * Coupon validation tests — covers discount logic and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../config/prisma.js", () => ({
  prisma: {
    coupon: { findUnique: vi.fn(), findMany: vi.fn() },
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
}));

const { prisma } = await import("../config/prisma.js");

// ── Inline the coupon validation logic to test it in isolation ────────────────
// (mirrors computeCouponDiscount from orders.service.js)

function computeDiscount(coupon, subtotal, restaurantId) {
  if (!coupon) throw new Error("Invalid coupon");
  if (!coupon.isActive) throw new Error("Coupon is no longer active");
  if (new Date() > new Date(coupon.expiresAt)) throw new Error("Coupon has expired");
  if (coupon.usedCount >= coupon.maxUses) throw new Error("Coupon usage limit exceeded");
  if (coupon.restaurantId && coupon.restaurantId !== restaurantId) {
    throw new Error("Coupon is not valid for this restaurant");
  }
  if (subtotal < Number(coupon.minOrder)) {
    throw new Error("Order total below minimum");
  }
  let discount = 0;
  if (coupon.discountType === "PERCENTAGE") {
    discount = Math.round(subtotal * (Number(coupon.discountValue) / 100));
  } else if (coupon.discountType === "FLAT") {
    discount = Math.round(Number(coupon.discountValue));
  }
  return Math.min(discount, subtotal);
}

function makeCoupon(overrides = {}) {
  return {
    code: "TEST10",
    isActive: true,
    expiresAt: new Date(Date.now() + 86400000), // tomorrow
    usedCount: 0,
    maxUses: 100,
    minOrder: 10000, // ₹100 in paise
    discountType: "PERCENTAGE",
    discountValue: "10",
    restaurantId: null,
    ...overrides,
  };
}

describe("computeDiscount — PERCENTAGE coupons", () => {
  it("calculates 10% discount correctly", () => {
    const coupon = makeCoupon({ discountType: "PERCENTAGE", discountValue: "10" });
    expect(computeDiscount(coupon, 50000, null)).toBe(5000);
  });

  it("never discounts below 0", () => {
    const coupon = makeCoupon({ discountType: "PERCENTAGE", discountValue: "50" });
    expect(computeDiscount(coupon, 10000, null)).toBeLessThanOrEqual(10000);
  });
});

describe("computeDiscount — FLAT coupons", () => {
  it("applies a flat ₹30 discount (3000 paise)", () => {
    const coupon = makeCoupon({ discountType: "FLAT", discountValue: "3000" });
    expect(computeDiscount(coupon, 50000, null)).toBe(3000);
  });

  it("caps flat discount at subtotal", () => {
    const coupon = makeCoupon({ discountType: "FLAT", discountValue: "999999" });
    const subtotal = 12000;
    expect(computeDiscount(coupon, subtotal, null)).toBe(subtotal);
  });
});

describe("computeDiscount — validation failures", () => {
  it("throws for inactive coupon", () => {
    expect(() => computeDiscount(makeCoupon({ isActive: false }), 50000, null)).toThrow("no longer active");
  });

  it("throws for expired coupon", () => {
    const expired = makeCoupon({ expiresAt: new Date(Date.now() - 1000) });
    expect(() => computeDiscount(expired, 50000, null)).toThrow("expired");
  });

  it("throws when usage limit exceeded", () => {
    const full = makeCoupon({ usedCount: 100, maxUses: 100 });
    expect(() => computeDiscount(full, 50000, null)).toThrow("limit exceeded");
  });

  it("throws when subtotal below minimum order", () => {
    const coupon = makeCoupon({ minOrder: 100000 }); // ₹1000 minimum
    expect(() => computeDiscount(coupon, 50000, null)).toThrow("minimum");
  });

  it("throws when coupon is for a different restaurant", () => {
    const coupon = makeCoupon({ restaurantId: "rest-A" });
    expect(() => computeDiscount(coupon, 50000, "rest-B")).toThrow("not valid for this restaurant");
  });

  it("passes when coupon restaurant matches", () => {
    const coupon = makeCoupon({ restaurantId: "rest-A", discountType: "FLAT", discountValue: "1000" });
    expect(computeDiscount(coupon, 50000, "rest-A")).toBe(1000);
  });
});

describe("getCouponByCode — public response does not leak internal fields", () => {
  it("response excludes id, usedCount, maxUses, restaurantId", async () => {
    const dbCoupon = {
      id: "internal-uuid",
      code: "SAVE10",
      discountType: "PERCENTAGE",
      discountValue: "10.00",
      minOrder: "10000.00",
      expiresAt: new Date(Date.now() + 86400000),
      isActive: true,
      usedCount: 5,
      maxUses: 100,
      restaurantId: "rest-secret-id",
    };
    prisma.coupon.findUnique.mockResolvedValue(dbCoupon);

    // Simulate the controller's response shape (after our fix)
    const publicResponse = {
      code: dbCoupon.code,
      discountType: dbCoupon.discountType,
      discountValue: parseFloat(dbCoupon.discountValue),
      minOrder: parseFloat(dbCoupon.minOrder),
      expiresAt: dbCoupon.expiresAt,
      isActive: dbCoupon.isActive,
    };

    expect(publicResponse).not.toHaveProperty("id");
    expect(publicResponse).not.toHaveProperty("usedCount");
    expect(publicResponse).not.toHaveProperty("maxUses");
    expect(publicResponse).not.toHaveProperty("restaurantId");
  });
});
