import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { logger } from "../../utils/logger.js";
import { updateRiderLocation, checkInRider, checkOutRider } from "./delivery.service.js";
import { acceptOrderOffer, rejectOrderOffer } from "../orders/orders.service.js";

const router = express.Router();

// Every delivery route requires the DELIVERY role — previously any logged-in
// customer could toggle availability and read order/customer details.
router.use(authenticate, roleMiddleware(["DELIVERY", "ADMIN"]));

// POST /api/delivery/location
// Rider GPS ping. The rider id is taken from the authenticated token, never the
// body, so a rider can only ever update their own location. Broadcasts to admin.
router.post("/location", async (req, res, next) => {
  try {
    const { latitude, longitude, heading, speed } = req.body;
    const location = await updateRiderLocation(req.user.userId, { latitude, longitude, heading, speed });
    res.json({ location });
  } catch (e) { next(e); }
});

// PATCH /api/delivery/status
router.patch("/status", async (req, res, next) => {
  try {
    const { isAvailable, currentLat, currentLng, isOnDuty } = req.body;
    const data = {};
    if (isAvailable !== undefined) data.isAvailable = Boolean(isAvailable);
    if (isOnDuty !== undefined) data.isOnDuty = Boolean(isOnDuty);
    if (currentLat !== undefined) {
      const lat = Number(currentLat);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new AppError("Invalid latitude", 400);
      data.currentLat = lat;
    }
    if (currentLng !== undefined) {
      const lng = Number(currentLng);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new AppError("Invalid longitude", 400);
      data.currentLng = lng;
    }

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data,
      select: { id: true, name: true, isAvailable: true, isOnDuty: true, currentLat: true, currentLng: true },
    });

    // Session tracking: open a session on duty-on, close it on duty-off.
    // Non-fatal — a session tracking failure must not block duty-toggle.
    if (isOnDuty === true)  checkInRider(req.user.userId).catch(() => {});
    if (isOnDuty === false) checkOutRider(req.user.userId).catch(() => {});

    if (data.isAvailable === true) {
      logger.info("Agent went online", {
        userId: user.id,
        lat: user.currentLat,
        lng: user.currentLng,
      });
    } else if (data.isAvailable === false) {
      logger.info("Agent went offline", { userId: user.id });
    }

    res.json({ user });
  } catch (e) { next(e); }
});

// POST /api/delivery/orders/:orderId/accept
// Real acceptance of an order OFFER (see assignDeliveryAgent in
// orders.service.js). Only the rider this order was actually offered to can
// accept — enforced by the WHERE pendingAgentId = userId guard inside
// acceptOrderOffer, which makes the claim atomic under a race.
router.post("/orders/:orderId/accept", async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const io = req.app.locals.io;
    const result = await acceptOrderOffer(orderId, req.user.userId, io);
    if (!result.ok) {
      throw new AppError(result.reason, 409);
    }
    res.json({ order: result.order });
  } catch (e) { next(e); }
});

// POST /api/delivery/orders/:orderId/reject
// Declines an offer. Frees the rider and immediately tries the next
// available rider; the 2-minute reassignment job is the fallback if nobody
// else is available right now.
router.post("/orders/:orderId/reject", async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const io = req.app.locals.io;
    const result = await rejectOrderOffer(orderId, req.user.userId, io);
    if (!result.ok) {
      throw new AppError(result.reason, 409);
    }
    res.json({ success: true, reassigned: result.reassigned });
  } catch (e) { next(e); }
});

// GET /api/delivery/earnings
router.get("/earnings", async (req, res, next) => {
  try {
    const agentId = req.user.userId;
    const { period = "today" } = req.query;

    const now = new Date();
    let startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);

    if (period === "week") {
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const orders = await prisma.order.findMany({
      where: {
        agentId,
        status: "DELIVERED",
        deliveredAt: { gte: startDate },
      },
      select: { id: true, deliveryFee: true, deliveredAt: true, restaurantId: true },
      orderBy: { deliveredAt: "desc" },
    });

    // All earnings figures returned in RUPEES (display-only endpoint).
    // deliveryFee is stored in paise, so the 10% share is fee/10/100.
    const BASE_PAY = 40; // ₹40 per delivery
    const payoutFor = (o) => BASE_PAY + Math.round(Number(o.deliveryFee) * 0.1) / 100;
    const total = Math.round(orders.reduce((sum, o) => sum + payoutFor(o), 0));
    const deliveries = orders.length;
    const avgPerDelivery = deliveries > 0 ? Math.round(total / deliveries) : 0;

    // Build daily breakdown (last 7 days)
    const dailyMap = new Map();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-IN", { weekday: "short" });
      dailyMap.set(key, { label, orders: 0, earnings: 0 });
    }
    for (const o of orders) {
      if (!o.deliveredAt) continue;
      const key = new Date(o.deliveredAt).toISOString().slice(0, 10);
      if (dailyMap.has(key)) {
        const entry = dailyMap.get(key);
        entry.orders += 1;
        entry.earnings += Math.round(payoutFor(o));
      }
    }

    // Sum completed session durations within the period
    const sessions = await prisma.riderSession.findMany({
      where: { riderId: agentId, startedAt: { gte: startDate }, endedAt: { not: null } },
      select: { durationMin: true },
    });
    const onlineMinutes = sessions.reduce((sum, s) => sum + (s.durationMin ?? 0), 0);
    const onlineHours = Math.round((onlineMinutes / 60) * 10) / 10; // 1 decimal

    res.json({
      total,
      deliveries,
      avgPerDelivery,
      onlineHours,
      dailyBreakdown: Array.from(dailyMap.values()),
      recentOrders: orders.slice(0, 20).map((o, i) => ({
        id: `pay-${i + 1}`,
        orderId: o.id,
        date: o.deliveredAt,
        basePay: BASE_PAY,
        tip: 0,
        total: Math.round(payoutFor(o)),
      })),
    });
  } catch (e) { next(e); }
});

export default router;
