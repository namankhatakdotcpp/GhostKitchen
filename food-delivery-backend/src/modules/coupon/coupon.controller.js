import { prisma } from "../../config/prisma.js";
import { logger } from "../../utils/logger.js";
import { cacheDelete, cacheOrFetch, cacheSet } from "../../utils/cache.js";

/**
 * Validate and apply a coupon to an order total
 */
// All monetary values (orderTotal, minOrder, FLAT discountValue, discountAmount,
// finalAmount) are in PAISE — same unit the rest of the platform uses.
export const validateCoupon = async (req, res, next) => {
  try {
    const { code, orderTotal, restaurantId } = req.body;

    if (!code || typeof orderTotal !== "number" || orderTotal <= 0) {
      return res.status(400).json({ error: "Code and orderTotal (paise) required" });
    }

    // Short cache — long TTLs served stale coupons after admin deactivation
    const cacheKey = `coupon:${code.toUpperCase()}`;
    const coupon = await cacheOrFetch(
      cacheKey,
      async () => {
        return await prisma.coupon.findUnique({
          where: { code: code.toUpperCase() },
        });
      },
      60
    );

    if (!coupon || !coupon.isActive) {
      return res.status(404).json({ error: "Invalid coupon code" });
    }

    if (new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Coupon expired" });
    }

    if (coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ error: "Coupon usage limit exceeded" });
    }

    if (coupon.restaurantId && restaurantId && coupon.restaurantId !== restaurantId) {
      return res.status(400).json({ error: "Coupon is not valid for this restaurant" });
    }

    const minOrder = Number(coupon.minOrder);
    if (orderTotal < minOrder) {
      return res.status(400).json({
        error: `Minimum order value of ₹${(minOrder / 100).toFixed(0)} required`,
      });
    }

    let discountAmount = 0;
    if (coupon.discountType === "PERCENTAGE") {
      discountAmount = Math.round((orderTotal * Number(coupon.discountValue)) / 100);
    } else if (coupon.discountType === "FLAT") {
      discountAmount = Math.round(Number(coupon.discountValue));
    }
    discountAmount = Math.min(discountAmount, orderTotal);

    const finalAmount = Math.max(0, orderTotal - discountAmount);

    res.json({
      success: true,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue),
        discountAmount,
        originalTotal: orderTotal,
        finalAmount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all active coupons (for customer display)
 */
export const getActiveCoupons = async (req, res, next) => {
  try {
    const coupons = await prisma.coupon.findMany({
      where: {
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        code: true,
        discountType: true,
        discountValue: true,
        minOrder: true,
        expiresAt: true,
        usedCount: true,
        maxUses: true,
      },
      orderBy: { expiresAt: "asc" },
      take: 100,
    });

    res.json({
      coupons: coupons.map((c) => ({
        ...c,
        discountValue: parseFloat(c.discountValue),
        minOrder: parseFloat(c.minOrder),
        availableUses: c.maxUses - c.usedCount,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/coupons/available?restaurantId=
 * Public: active coupons for a restaurant or global ones
 */
export const getAvailableCoupons = async (req, res, next) => {
  try {
    const { restaurantId } = req.query;
    const where = {
      isActive: true,
      expiresAt: { gt: new Date() },
    };
    if (restaurantId) {
      where.OR = [{ restaurantId }, { restaurantId: null }];
    }

    const coupons = await prisma.coupon.findMany({
      where,
      select: {
        code: true,
        description: true,
        discountType: true,
        discountValue: true,
        minOrder: true,
        expiresAt: true,
        maxUses: true,
        usedCount: true,
      },
      orderBy: { expiresAt: "asc" },
    });

    res.json({
      coupons: coupons
        .filter((c) => c.usedCount < c.maxUses)
        .map((c) => ({
          code: c.code,
          description: c.description,
          discountType: c.discountType,
          discountValue: parseFloat(String(c.discountValue)),
          minOrder: parseFloat(String(c.minOrder)),
          expiresAt: c.expiresAt,
        })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get coupon by code (admin view)
 */
export const getCouponByCode = async (req, res, next) => {
  try {
    const { code } = req.params;

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    res.json({
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: parseFloat(coupon.discountValue),
        minOrder: parseFloat(coupon.minOrder),
        expiresAt: coupon.expiresAt,
        isActive: coupon.isActive,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create coupon (admin only)
 */
export const createCoupon = async (req, res, next) => {
  try {
    const { code, discountType, discountValue, minOrder, maxUses, expiresAt } =
      req.body;

    // Validate input
    if (
      !code ||
      !discountType ||
      !discountValue ||
      !minOrder ||
      !maxUses ||
      !expiresAt
    ) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (!["PERCENTAGE", "FLAT"].includes(discountType)) {
      return res.status(400).json({ error: "Invalid discount type" });
    }

    if (discountValue <= 0) {
      return res.status(400).json({ error: "Discount value must be positive" });
    }

    // Create coupon
    const coupon = await prisma.coupon.create({
      data: {
        code: code.toUpperCase(),
        discountType,
        discountValue: parseFloat(discountValue),
        minOrder: parseFloat(minOrder),
        maxUses,
        expiresAt: new Date(expiresAt),
      },
    });

    logger.info(`Coupon created: ${coupon.code}`);

    res.json({
      success: true,
      coupon,
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Coupon code already exists" });
    }
    next(error);
  }
};

/**
 * Update coupon (admin only)
 */
export const updateCoupon = async (req, res, next) => {
  try {
    const { code } = req.params;
    const { discountType, discountValue, minOrder, maxUses, expiresAt } = req.body;

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    const updated = await prisma.coupon.update({
      where: { id: coupon.id },
      data: {
        ...(discountType && { discountType }),
        ...(discountValue && { discountValue: parseFloat(discountValue) }),
        ...(minOrder && { minOrder: parseFloat(minOrder) }),
        ...(maxUses && { maxUses }),
        ...(expiresAt && { expiresAt: new Date(expiresAt) }),
      },
    });

    // Invalidate cache
    cacheDelete(`coupon:${code.toUpperCase()}`);

    logger.info(`Coupon updated: ${code}`);

    res.json({
      success: true,
      coupon: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete coupon (admin only)
 */
export const deleteCoupon = async (req, res, next) => {
  try {
    const { code } = req.params;

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      return res.status(404).json({ error: "Coupon not found" });
    }

    await prisma.coupon.delete({
      where: { id: coupon.id },
    });

    // Invalidate cache
    cacheDelete(`coupon:${code.toUpperCase()}`);

    logger.info(`Coupon deleted: ${code}`);

    res.json({
      success: true,
      message: "Coupon deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
