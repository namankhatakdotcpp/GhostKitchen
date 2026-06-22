import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { roleMiddleware } from "../../middlewares/role.middleware.js";
import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { logger } from "../../utils/logger.js";
import { updateRiderLocation, checkInRider, checkOutRider } from "./delivery.service.js";

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

// POST /api/delivery/accept-order/:orderId
// Atomically claims the order for this agent if it is unassigned.
router.post("/accept-order/:orderId", async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const agentId = req.user.userId;

    // Claim: only succeeds when the order is unassigned or already ours.
    const claimed = await prisma.order.updateMany({
      where: {
        id: orderId,
        status: { in: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"] },
        OR: [{ agentId: null }, { agentId }],
      },
      data: { agentId },
    });

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        restaurant: { select: { id: true, name: true, address: true, lat: true, lng: true, imageUrl: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!order) throw new AppError("Order not found", 404);
    if (order.agentId !== agentId) {
      throw new AppError(claimed.count === 0 ? "Order assigned to another agent" : "Could not claim order", 403);
    }

    // Mask customer phone — show only last 4 digits
    const maskedPhone = order.customer?.phone
      ? order.customer.phone.slice(0, -4).replace(/\d/g, "*") + order.customer.phone.slice(-4)
      : null;

    res.json({
      order: {
        ...order,
        customer: { ...order.customer, phone: maskedPhone },
      },
    });
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
