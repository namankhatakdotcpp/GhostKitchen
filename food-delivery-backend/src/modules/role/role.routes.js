import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { setAuthCookies } from "../auth/auth.controller.js";
import {
  switchRole, registerRestaurant, addRestaurant, registerRider,
  getMyRestaurants, updateMyRestaurant,
} from "./role.service.js";
import { prisma } from "../../config/prisma.js";
import { auditLog } from "../../utils/audit.js";

const router = express.Router();

// POST /api/role/switch
// Issues a new access_token cookie with updated activeRole
router.post("/switch", authenticate, async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!role) return res.status(400).json({ message: "role is required" });
    const prevRole = req.user.activeRole
    const result = await switchRole(req.user.userId, role);
    setAuthCookies(res, result.token, req.cookies?.refresh_token ?? "");
    await auditLog({ userId: req.user.userId, action: 'ROLE_SWITCHED', meta: { from: prevRole, to: role }, req })
    res.json({ activeRole: result.activeRole, user: result.user, accessToken: result.token });
  } catch (e) { next(e); }
});

// POST /api/role/register-restaurant
router.post("/register-restaurant", authenticate, async (req, res, next) => {
  try {
    const result = await registerRestaurant(req.user.userId, req.body);
    setAuthCookies(res, result.token, req.cookies?.refresh_token ?? "");
    // Audit logging is best-effort — never let a logging failure crash the
    // registration response. The user must always get a clean 201 with their
    // new restaurant + healed user record.
    try {
      await auditLog({
        userId: req.user.userId,
        action: 'RESTAURANT_REGISTERED',
        entityType: 'Restaurant',
        entityId: result.restaurant?.id,
        meta: { name: result.restaurant?.name },
        req,
      });
    } catch (auditErr) {
      console.warn("[register-restaurant] audit log failed (non-fatal):", auditErr.message);
    }
    res.status(201).json({ restaurant: result.restaurant, user: result.user, accessToken: result.token });
  } catch (e) {
    // Surface the actual error to Render logs so future 500s are diagnosable.
    console.error("[register-restaurant] failed:", {
      userId: req.user?.userId,
      message: e?.message,
      stack: e?.stack,
      code: e?.code,
      meta: e?.meta,
    });
    // DIAGNOSTIC: return error details in the response body so the cause is
    // visible from the browser without needing Render log access. If e is an
    // operational AppError, defer to the global handler (it formats nicely).
    // Otherwise return the raw Prisma/JS error so we can see what's happening.
    if (e?.isOperational) return next(e);
    return res.status(500).json({
      error: e?.message ?? "Unknown error",
      code: e?.code ?? null,
      meta: e?.meta ?? null,
      where: "register-restaurant",
    });
  }
});

// POST /api/role/add-restaurant (already a RESTAURANT owner, adding another city)
router.post("/add-restaurant", authenticate, async (req, res, next) => {
  try {
    const restaurant = await addRestaurant(req.user.userId, req.body);
    res.status(201).json({ restaurant });
  } catch (e) { next(e); }
});

// POST /api/role/register-rider
router.post("/register-rider", authenticate, async (req, res, next) => {
  try {
    const result = await registerRider(req.user.userId, req.body);
    setAuthCookies(res, result.token, req.cookies?.refresh_token ?? "");
    res.status(201).json({ user: result.user, accessToken: result.token });
  } catch (e) { next(e); }
});

// GET /api/role/my-restaurants
router.get("/my-restaurants", authenticate, async (req, res, next) => {
  try {
    const restaurants = await getMyRestaurants(req.user.userId);
    res.json({ restaurants });
  } catch (e) { next(e); }
});

// GET /api/role/my-restaurant (active one from restaurantId in token)
router.get("/my-restaurant", authenticate, async (req, res, next) => {
  try {
    const restaurantId = req.user.restaurantId;
    if (!restaurantId) return res.status(404).json({ message: "No restaurant found" });
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        menuItems: { orderBy: { sortOrder: "asc" } },
        _count: { select: { orders: true } },
      },
    });
    if (!restaurant) return res.status(404).json({ message: "Restaurant not found" });
    res.json({ restaurant });
  } catch (e) { next(e); }
});

// PUT /api/role/my-restaurant
router.put("/my-restaurant", authenticate, async (req, res, next) => {
  try {
    const restaurantId = req.user.restaurantId || req.body.restaurantId;
    if (!restaurantId) return res.status(400).json({ message: "No restaurant associated with account" });
    const updated = await updateMyRestaurant(req.user.userId, restaurantId, req.body);
    res.json({ restaurant: updated });
  } catch (e) { next(e); }
});

export default router;
