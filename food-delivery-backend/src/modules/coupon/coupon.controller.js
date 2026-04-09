import { prisma } from "../../config/prisma.js";
import { logger } from "../../utils/logger.js";
import { cacheDelete, cacheOrFetch, cacheSet } from "../../utils/cache.js";

/**
 * Validate and apply a coupon to an order total
 */
export const validateCoupon = async (req, res, next) => {
  try {
    const { code, orderTotal } = req.body;

    if (!code || !orderTotal) {
      return res.status(400).json({ error: "Code and orderTotal required" });
    }

    // Check cache first
    const cacheKey = `coupon:${code.toUpperCase()}`;
    let coupon = await cacheOrFetch(
      cacheKey,
      async () => {
        return await prisma.coupon.findUnique({
          where: { code: code.toUpperCase() },
        });
      },
      3600 // Cache for 1 hour
    );

    if (!coupon) {
      return res.status(404).json({ error: "Invalid coupon code" });
    }

    // Check expiry
    if (new Date(coupon.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Coupon expired" });
    }

    // Check max uses
    if (coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ error: "Coupon usage limit exceeded" });
    }

    // Check minimum order value
    if (orderTotal < coupon.minOrder) {
      return res.status(400).json({
        error: `Minimum order value of ₹${coupon.minOrder} required`,
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === "PERCENTAGE") {
      discountAmount = (orderTotal * coupon.discountValue) / 100;
    } else if (coupon.discountType === "FLAT") {
      discountAmount = coupon.discountValue;
    }

    const finalAmount = Math.max(0, orderTotal - discountAmount);

    res.json({
      success: true,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        originalTotal: orderTotal,
        finalAmount: parseFloat(finalAmount.toFixed(2)),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Apply coupon (increment usage)
 * Called after order placement
 */
export const applyCoupon = async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: "Coupon code required" });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!coupon) {
      return res.status(404).json({ error: "Invalid coupon code" });
    }

    // Increment usage
    const updated = await prisma.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: coupon.usedCount + 1 },
    });

    // Invalidate cache
    cacheDelete(`coupon:${code.toUpperCase()}`);

    logger.info(`Coupon ${code} applied. Usage: ${updated.usedCount}/${coupon.maxUses}`);

    res.json({
      success: true,
      message: "Coupon applied successfully",
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
        expiresAt: {
          gt: new Date(),
        },
        usedCount: {
          lt: prisma.coupon.fields.maxUses,
        },
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
        ...coupon,
        discountValue: parseFloat(coupon.discountValue),
        minOrder: parseFloat(coupon.minOrder),
        availableUses: coupon.maxUses - coupon.usedCount,
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
