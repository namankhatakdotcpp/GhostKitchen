/**
 * Coupon controller extended tests
 * Covers: validateCoupon, getActiveCoupons, getAvailableCoupons, getCouponByCode,
 *         createCoupon, updateCoupon, deleteCoupon
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
    coupon: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("../utils/cache.js", () => ({
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDelete: vi.fn().mockResolvedValue(undefined),
  cacheOrFetch: vi.fn(),
  CACHE_KEYS: {},
  CACHE_TTL: {},
}));

const { prisma } = await import("../config/prisma.js");
const { cacheOrFetch } = await import("../utils/cache.js");
const { validateCoupon, getActiveCoupons, getAvailableCoupons, getCouponByCode, createCoupon, updateCoupon, deleteCoupon } = await import("../modules/coupon/coupon.controller.js");

// ── helpers ───────────────────────────────────────────────────────────────────
function mockRes() {
  const r = {};
  r.status = vi.fn().mockReturnValue(r);
  r.json = vi.fn().mockReturnValue(r);
  return r;
}

const next = vi.fn();

const activeCoupon = {
  id: "c-1",
  code: "SAVE10",
  isActive: true,
  expiresAt: new Date(Date.now() + 86400_000),
  usedCount: 5,
  maxUses: 100,
  discountType: "PERCENTAGE",
  discountValue: "10",
  minOrder: "9900",
  restaurantId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(cacheOrFetch).mockImplementation(async (_key, fetchFn) => fetchFn());
});

// ── validateCoupon ────────────────────────────────────────────────────────────
describe("validateCoupon", () => {
  it("returns 400 when code is missing", async () => {
    const req = { body: { orderTotal: 50000 } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when orderTotal is not a positive number", async () => {
    const req = { body: { code: "SAVE10", orderTotal: -1 } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when coupon not found", async () => {
    prisma.coupon.findUnique.mockResolvedValue(null);
    const req = { body: { code: "GHOST", orderTotal: 50000 } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 404 when coupon is inactive", async () => {
    prisma.coupon.findUnique.mockResolvedValue({ ...activeCoupon, isActive: false });
    const req = { body: { code: "SAVE10", orderTotal: 50000 } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 400 when coupon is expired", async () => {
    prisma.coupon.findUnique.mockResolvedValue({ ...activeCoupon, expiresAt: new Date(Date.now() - 1000) });
    const req = { body: { code: "SAVE10", orderTotal: 50000 } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/expired/i) }));
  });

  it("returns 400 when usage limit exceeded", async () => {
    prisma.coupon.findUnique.mockResolvedValue({ ...activeCoupon, usedCount: 100, maxUses: 100 });
    const req = { body: { code: "SAVE10", orderTotal: 50000 } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/limit/i) }));
  });

  it("returns 400 when minimum order not met", async () => {
    prisma.coupon.findUnique.mockResolvedValue({ ...activeCoupon, minOrder: "100000" });
    const req = { body: { code: "SAVE10", orderTotal: 5000 } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/minimum/i) }));
  });

  it("applies PERCENTAGE discount correctly", async () => {
    prisma.coupon.findUnique.mockResolvedValue(activeCoupon);
    const req = { body: { code: "SAVE10", orderTotal: 50000 } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        coupon: expect.objectContaining({ discountAmount: 5000, finalAmount: 45000 }),
      })
    );
  });

  it("applies FLAT discount correctly", async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      ...activeCoupon,
      discountType: "FLAT",
      discountValue: "2000",
    });
    const req = { body: { code: "FLAT20", orderTotal: 50000 } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        coupon: expect.objectContaining({ discountAmount: 2000, finalAmount: 48000 }),
      })
    );
  });

  it("returns 400 when coupon does not match restaurant", async () => {
    prisma.coupon.findUnique.mockResolvedValue({ ...activeCoupon, restaurantId: "rest-A" });
    const req = { body: { code: "SAVE10", orderTotal: 50000, restaurantId: "rest-B" } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("caps discount at orderTotal (never negative final)", async () => {
    prisma.coupon.findUnique.mockResolvedValue({
      ...activeCoupon,
      discountType: "FLAT",
      discountValue: "999999", // more than orderTotal
      minOrder: "0",
    });
    const req = { body: { code: "BIGFLAT", orderTotal: 10000 } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    const json = res.json.mock.calls[0][0];
    expect(json.coupon.finalAmount).toBe(0);
  });

  it("calls next on error", async () => {
    prisma.coupon.findUnique.mockRejectedValue(new Error("DB error"));
    const req = { body: { code: "SAVE10", orderTotal: 50000 } };
    const res = mockRes();
    await validateCoupon(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── getActiveCoupons ──────────────────────────────────────────────────────────
describe("getActiveCoupons", () => {
  it("returns active coupons without sensitive fields", async () => {
    prisma.coupon.findMany.mockResolvedValue([activeCoupon]);
    const res = mockRes();
    await getActiveCoupons({}, res, next);

    const json = res.json.mock.calls[0][0];
    expect(json.coupons).toHaveLength(1);
    expect(json.coupons[0]).toHaveProperty("availableUses");
    expect(json.coupons[0]).not.toHaveProperty("usedCount");
    expect(json.coupons[0]).not.toHaveProperty("maxUses");
  });

  it("returns empty array when no active coupons", async () => {
    prisma.coupon.findMany.mockResolvedValue([]);
    const res = mockRes();
    await getActiveCoupons({}, res, next);

    expect(res.json.mock.calls[0][0].coupons).toHaveLength(0);
  });

  it("calls next on error", async () => {
    prisma.coupon.findMany.mockRejectedValue(new Error("DB error"));
    await getActiveCoupons({}, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── getAvailableCoupons ───────────────────────────────────────────────────────
describe("getAvailableCoupons", () => {
  it("returns coupons for a specific restaurant", async () => {
    prisma.coupon.findMany.mockResolvedValue([activeCoupon]);
    const res = mockRes();
    await getAvailableCoupons({ query: { restaurantId: "rest-1" } }, res, next);
    expect(res.json).toHaveBeenCalled();
  });

  it("returns coupons without restaurantId filter when not provided", async () => {
    prisma.coupon.findMany.mockResolvedValue([]);
    const res = mockRes();
    await getAvailableCoupons({ query: {} }, res, next);
    expect(res.json).toHaveBeenCalled();
  });

  it("calls next on error", async () => {
    prisma.coupon.findMany.mockRejectedValue(new Error("DB down"));
    await getAvailableCoupons({ query: {} }, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── getCouponByCode ───────────────────────────────────────────────────────────
describe("getCouponByCode", () => {
  it("returns coupon subset when found", async () => {
    prisma.coupon.findUnique.mockResolvedValue(activeCoupon);
    const res = mockRes();
    await getCouponByCode({ params: { code: "SAVE10" } }, res, next);
    const json = res.json.mock.calls[0][0];
    expect(json.coupon.code).toBe("SAVE10");
    expect(json.coupon.discountType).toBe("PERCENTAGE");
  });

  it("returns 404 when not found", async () => {
    prisma.coupon.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await getCouponByCode({ params: { code: "GHOST" } }, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── createCoupon ──────────────────────────────────────────────────────────────
describe("createCoupon", () => {
  it("creates a coupon and returns success json", async () => {
    const created = { ...activeCoupon, id: "c-new" };
    prisma.coupon.create.mockResolvedValue(created);

    const req = {
      body: {
        code: "SAVE10",
        discountType: "PERCENTAGE",
        discountValue: 10,
        minOrder: 9900,
        maxUses: 100,
        expiresAt: new Date(Date.now() + 86400_000).toISOString(),
      },
    };
    const res = mockRes();
    await createCoupon(req, res, next);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.coupon).toEqual(created);
  });

  it("returns 400 when required fields missing", async () => {
    const req = { body: {} };
    const res = mockRes();
    await createCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when discountType invalid", async () => {
    const req = { body: { code: "X", discountType: "BOGUS", discountValue: 10, minOrder: 0, maxUses: 10, expiresAt: new Date().toISOString() } };
    const res = mockRes();
    await createCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 for P2002 duplicate code", async () => {
    const err = new Error("Duplicate");
    err.code = "P2002";
    prisma.coupon.create.mockRejectedValue(err);
    const req = {
      body: { code: "DUPE", discountType: "FLAT", discountValue: 100, minOrder: 0, maxUses: 10, expiresAt: new Date(Date.now() + 86400_000).toISOString() },
    };
    const res = mockRes();
    await createCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("calls next on unexpected DB error", async () => {
    prisma.coupon.create.mockRejectedValue(new Error("DB error"));
    const req = {
      body: { code: "SAVE10", discountType: "FLAT", discountValue: 100, minOrder: 9900, maxUses: 10, expiresAt: new Date(Date.now() + 86400_000).toISOString() },
    };
    await createCoupon(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── updateCoupon ──────────────────────────────────────────────────────────────
describe("updateCoupon", () => {
  it("updates and returns coupon", async () => {
    prisma.coupon.findUnique.mockResolvedValue(activeCoupon);
    const updated = { ...activeCoupon, discountValue: "20" };
    prisma.coupon.update.mockResolvedValue(updated);

    const req = { params: { code: "SAVE10" }, body: { discountValue: 20 } };
    const res = mockRes();
    await updateCoupon(req, res, next);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
    expect(json.coupon).toEqual(updated);
  });

  it("returns 404 when coupon not found", async () => {
    prisma.coupon.findUnique.mockResolvedValue(null);

    const req = { params: { code: "GHOST" }, body: {} };
    const res = mockRes();
    await updateCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("calls next on unexpected error", async () => {
    prisma.coupon.findUnique.mockRejectedValue(new Error("DB error"));
    await updateCoupon({ params: { code: "X" }, body: {} }, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── deleteCoupon ──────────────────────────────────────────────────────────────
describe("deleteCoupon", () => {
  it("deletes coupon and returns success json", async () => {
    prisma.coupon.findUnique.mockResolvedValue(activeCoupon);
    prisma.coupon.delete.mockResolvedValue({ id: "c-1" });

    const req = { params: { code: "SAVE10" } };
    const res = mockRes();
    await deleteCoupon(req, res, next);
    const json = res.json.mock.calls[0][0];
    expect(json.success).toBe(true);
  });

  it("returns 404 when coupon not found", async () => {
    prisma.coupon.findUnique.mockResolvedValue(null);

    const req = { params: { code: "GHOST" } };
    const res = mockRes();
    await deleteCoupon(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("calls next on unexpected error", async () => {
    prisma.coupon.findUnique.mockRejectedValue(new Error("Unexpected DB error"));
    await deleteCoupon({ params: { code: "X" } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
