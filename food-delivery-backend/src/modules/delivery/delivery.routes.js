import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";

const router = express.Router();

// PATCH /api/delivery/status
router.patch("/status", authenticate, async (req, res, next) => {
  try {
    const { isAvailable, currentLat, currentLng, isOnDuty } = req.body;
    const data = {};
    if (isAvailable !== undefined) data.isAvailable = isAvailable;
    if (isOnDuty !== undefined) data.isOnDuty = isOnDuty;
    if (currentLat !== undefined) data.currentLat = currentLat;
    if (currentLng !== undefined) data.currentLng = currentLng;

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data,
      select: { id: true, name: true, isAvailable: true, isOnDuty: true, currentLat: true, currentLng: true },
    });
    res.json({ user });
  } catch (e) { next(e); }
});

// POST /api/delivery/accept-order/:orderId
router.post("/accept-order/:orderId", authenticate, async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const agentId = req.user.userId;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        restaurant: { select: { id: true, name: true, address: true, lat: true, lng: true, imageUrl: true } },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!order) throw new AppError("Order not found", 404);
    if (order.agentId && order.agentId !== agentId) throw new AppError("Order assigned to another agent", 403);

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
router.get("/earnings", authenticate, async (req, res, next) => {
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

    const BASE_PAY = 40;
    const total = orders.reduce((sum, o) => sum + BASE_PAY + Math.round(Number(o.deliveryFee) * 0.1), 0);
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
        entry.earnings += BASE_PAY + Math.round(Number(o.deliveryFee) * 0.1);
      }
    }

    res.json({
      total,
      deliveries,
      avgPerDelivery,
      onlineHours: 0,
      dailyBreakdown: Array.from(dailyMap.values()),
      recentOrders: orders.slice(0, 20).map((o, i) => ({
        id: `pay-${i + 1}`,
        orderId: o.id,
        date: o.deliveredAt,
        basePay: BASE_PAY,
        tip: 0,
        total: BASE_PAY + Math.round(Number(o.deliveryFee) * 0.1),
      })),
    });
  } catch (e) { next(e); }
});

export default router;
