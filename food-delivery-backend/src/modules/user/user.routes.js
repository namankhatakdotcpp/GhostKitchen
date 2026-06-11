import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";

const router = express.Router();

router.use(authenticate);

// ── Addresses ─────────────────────────────────────────────────────────────────

// GET /api/user/addresses
router.get("/addresses", async (req, res, next) => {
  try {
    const addresses = await prisma.address.findMany({
      where: { userId: req.user.userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    res.json({ addresses });
  } catch (e) { next(e); }
});

// POST /api/user/addresses
router.post("/addresses", async (req, res, next) => {
  try {
    const { label = "Home", line1, line2, city, state, pincode, lat, lng, isDefault = false } = req.body;
    if (!line1?.trim() || !city?.trim()) throw new AppError("line1 and city are required", 400);

    await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({ where: { userId: req.user.userId }, data: { isDefault: false } });
      }
      const count = await tx.address.count({ where: { userId: req.user.userId } });
      const address = await tx.address.create({
        data: {
          userId: req.user.userId,
          label: label.trim(),
          line1: line1.trim(),
          line2: line2?.trim() ?? null,
          city: city.trim(),
          state: state?.trim() ?? null,
          pincode: pincode?.trim() ?? null,
          lat: lat != null ? Number(lat) : null,
          lng: lng != null ? Number(lng) : null,
          isDefault: isDefault || count === 0, // first address is always default
        },
      });
      res.status(201).json({ address });
    });
  } catch (e) { next(e); }
});

// PATCH /api/user/addresses/:id
router.patch("/addresses/:id", async (req, res, next) => {
  try {
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user.userId } });
    if (!existing) throw new AppError("Address not found", 404);

    const { label, line1, line2, city, state, pincode, lat, lng, isDefault } = req.body;
    const data = {};
    if (label !== undefined) data.label = label.trim();
    if (line1 !== undefined) data.line1 = line1.trim();
    if (line2 !== undefined) data.line2 = line2?.trim() ?? null;
    if (city !== undefined) data.city = city.trim();
    if (state !== undefined) data.state = state?.trim() ?? null;
    if (pincode !== undefined) data.pincode = pincode?.trim() ?? null;
    if (lat !== undefined) data.lat = lat != null ? Number(lat) : null;
    if (lng !== undefined) data.lng = lng != null ? Number(lng) : null;

    await prisma.$transaction(async (tx) => {
      if (isDefault === true) {
        await tx.address.updateMany({ where: { userId: req.user.userId }, data: { isDefault: false } });
        data.isDefault = true;
      }
      const address = await tx.address.update({ where: { id: req.params.id }, data });
      res.json({ address });
    });
  } catch (e) { next(e); }
});

// DELETE /api/user/addresses/:id
router.delete("/addresses/:id", async (req, res, next) => {
  try {
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user.userId } });
    if (!existing) throw new AppError("Address not found", 404);
    await prisma.address.delete({ where: { id: req.params.id } });
    // If deleted address was default, promote the newest remaining one
    if (existing.isDefault) {
      const next_ = await prisma.address.findFirst({ where: { userId: req.user.userId }, orderBy: { createdAt: "desc" } });
      if (next_) await prisma.address.update({ where: { id: next_.id }, data: { isDefault: true } });
    }
    res.json({ success: true });
  } catch (e) { next(e); }
});

// POST /api/user/addresses/:id/set-default
router.post("/addresses/:id/set-default", async (req, res, next) => {
  try {
    const existing = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user.userId } });
    if (!existing) throw new AppError("Address not found", 404);
    await prisma.$transaction([
      prisma.address.updateMany({ where: { userId: req.user.userId }, data: { isDefault: false } }),
      prisma.address.update({ where: { id: req.params.id }, data: { isDefault: true } }),
    ]);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Favorites ─────────────────────────────────────────────────────────────────

// GET /api/user/favorites
router.get("/favorites", async (req, res, next) => {
  try {
    const favorites = await prisma.favorite.findMany({
      where: { userId: req.user.userId },
      include: {
        restaurant: {
          select: {
            id: true, name: true, slug: true, imageUrl: true,
            cuisines: true, rating: true, reviewCount: true,
            isOpen: true, statusNote: true, address: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ favorites: favorites.map((f) => f.restaurant) });
  } catch (e) { next(e); }
});

// POST /api/user/favorites/:restaurantId — toggle
router.post("/favorites/:restaurantId", async (req, res, next) => {
  try {
    const { restaurantId } = req.params;
    const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
    if (!restaurant) throw new AppError("Restaurant not found", 404);

    const existing = await prisma.favorite.findUnique({
      where: { userId_restaurantId: { userId: req.user.userId, restaurantId } },
    });
    if (existing) {
      await prisma.favorite.delete({ where: { id: existing.id } });
      return res.json({ favorited: false });
    }
    await prisma.favorite.create({ data: { userId: req.user.userId, restaurantId } });
    res.json({ favorited: true });
  } catch (e) { next(e); }
});

// GET /api/user/favorites/:restaurantId — check status
router.get("/favorites/:restaurantId", async (req, res, next) => {
  try {
    const fav = await prisma.favorite.findUnique({
      where: { userId_restaurantId: { userId: req.user.userId, restaurantId: req.params.restaurantId } },
    });
    res.json({ favorited: !!fav });
  } catch (e) { next(e); }
});

// ── Profile ───────────────────────────────────────────────────────────────────

// PATCH /api/user/profile
router.patch("/profile", async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    const data = {};
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) throw new AppError("Name must be at least 2 characters", 400);
      data.name = name.trim();
    }
    if (phone !== undefined) {
      const cleaned = String(phone).replace(/\D/g, "");
      if (cleaned && cleaned.length !== 10) throw new AppError("Phone must be 10 digits", 400);
      data.phone = cleaned || null;
    }
    if (Object.keys(data).length === 0) throw new AppError("No fields to update", 400);
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data,
      select: { id: true, name: true, email: true, phone: true, roles: true, activeRole: true },
    });
    res.json({ user });
  } catch (e) { next(e); }
});

export default router;
