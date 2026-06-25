import {
  assignDeliveryAgent,
  calculateOrderTotal,
  createOrder,
  getOrderById,
  listOrders,
  updateOrderStatus,
} from "./orders.service.js";
import { prisma } from "../../config/prisma.js";
import { validateCreateOrder, validateStatusUpdate } from "./orders.validation.js";
import { emitOrderAssignedToAgent, emitOrderNew, emitOrderStatusUpdated } from "../../socket/socket.server.js";
import { createNotification } from "../notification/notification.service.js";
import { sendOrderPlacedEmail, sendOrderStatusEmail } from "../../services/email.service.js";
import { computeETA } from "../../utils/eta.js";
import { logger } from "../../utils/logger.js";

export const getOrders = async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const { userId, role } = req.user;

    // Shopkeeper can fetch orders for their restaurant
    if (restaurantId && (role === "RESTAURANT" || role === "ADMIN")) {
      const { prisma } = await import("../../config/prisma.js");

      // Verify shopkeeper owns this restaurant
      if (role === "RESTAURANT") {
        const restaurant = await prisma.restaurant.findFirst({
          where: { id: restaurantId, ownerId: userId },
        });
        if (!restaurant) return res.status(403).json({ message: "Not authorized for this restaurant" });
      }

      const orders = await prisma.order.findMany({
        // The shop's own board view excludes cards staff has dismissed
        // (hiddenFromShopBoard) — admin's view of the same restaurant's
        // orders is a separate, broader operational view and still sees
        // everything, dismissed or not.
        where: { restaurantId, ...(role === "RESTAURANT" ? { hiddenFromShopBoard: false } : {}) },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          agent: { select: { id: true, name: true, phone: true } },
        },
        orderBy: { placedAt: "desc" },
        take: 100,
      });

      return res.json({ orders });
    }

    const orders = await listOrders(userId);
    return res.json({ orders });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch orders" });
  }
};

// Only participants may see an order: the customer, the restaurant owner,
// the assigned delivery agent, or an admin. Without this check any logged-in
// user could read any order (address, items, phone) by guessing IDs.
async function canAccessOrder(order, user) {
  if (user.role === "ADMIN") return true;
  if (order.customerId === user.userId) return true;
  if (order.agentId && order.agentId === user.userId) return true;
  if (user.roles?.includes("RESTAURANT")) {
    const { prisma } = await import("../../config/prisma.js");
    const owned = await prisma.restaurant.findFirst({
      where: { id: order.restaurantId, ownerId: user.userId },
      select: { id: true },
    });
    if (owned) return true;
  }
  return false;
}

export const getOrder = async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (!(await canAccessOrder(order, req.user))) {
      return res.status(403).json({ message: "Not authorized to view this order" });
    }

    return res.json({ order });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch order" });
  }
};

// PATCH /api/orders/:id/hide-from-board
// RESTAURANT-only, view-only dismissal — does NOT touch order.status. Only
// hides this card from the calling restaurant's own Orders Board (e.g. a
// stuck/stale order the shop wants out of view). Persisted so it survives a
// refresh, rather than being purely client-side React state.
export const hideFromShopBoard = async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const { prisma } = await import("../../config/prisma.js");
    const owned = await prisma.restaurant.findFirst({
      where: { id: order.restaurantId, ownerId: req.user.userId },
      select: { id: true },
    });
    if (!owned) return res.status(403).json({ message: "Not authorized for this restaurant's orders" });

    await prisma.order.update({ where: { id: req.params.id }, data: { hiddenFromShopBoard: true } });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ message: "Unable to dismiss order from board" });
  }
};

export const placeOrder = async (req, res) => {
  try {
    const validationError = validateCreateOrder(req.body);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const order = await createOrder(req.body, req.user.userId);

    emitOrderNew({
      restaurantId: order.restaurantId,
      order,
    });

    if (order.agentId) {
      emitOrderAssignedToAgent({
        agentId: order.agentId,
        order,
        pickup: order.restaurant?.address,
        dropoff: order.deliveryAddress,
        earnings: Math.max(Math.round(Number(order.deliveryFee) + 40), 50),
      });
    }

    // Fire-and-forget order placed email
    (async () => {
      try {
        const { prisma } = await import("../../config/prisma.js");
        const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { email: true, name: true } });
        if (user?.email) {
          await sendOrderPlacedEmail({
            to: user.email,
            name: user.name,
            orderId: order.id,
            restaurantName: order.restaurant?.name ?? "Restaurant",
            items: Array.isArray(order.items) ? order.items : [],
            total: order.total,
          });
        }
      } catch { /* non-fatal */ }
    })();

    return res.status(201).json({ order });
  } catch (error) {
    // Handle specific validation errors
    if (
      error.message?.includes("Invalid items") ||
      error.message?.includes("Invalid coupon") ||
      error.message?.includes("Coupon") ||
      error.message?.includes("Not found") ||
      error.message?.includes("not accepting orders") ||
      error.message?.includes("Restaurant not found") ||
      error.message?.includes("same city")
    ) {
      return res.status(400).json({ success: false, message: error.message });
    }

    logger.error("Order creation error", { error: error.message });
    return res.status(500).json({ message: "Unable to place order" });
  }
};

// POST /api/orders/calculate
// Preview-only — returns the full pricing breakdown without creating
// anything, so checkout can show exact line items (and the COD "Place
// Order — ₹X" total) before the customer commits. Same calculateOrderTotal
// the paid flow uses to build its Cashfree session, so the preview can
// never drift from what actually gets charged.
export const calculateOrderPreview = async (req, res) => {
  try {
    const { restaurantId, items, couponCode, deliveryAddress } = req.body;
    if (!restaurantId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "restaurantId and items are required" });
    }
    const pricing = await calculateOrderTotal({ restaurantId, items, couponCode, deliveryAddress });
    return res.json({ pricing });
  } catch (error) {
    if (
      error.message?.includes("Invalid items") ||
      error.message?.includes("coupon") ||
      error.message?.includes("Coupon") ||
      error.message?.includes("same city")
    ) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Unable to calculate order total" });
  }
};

export const updateOrderStatusHTTP = async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const { status: newStatus } = req.body;
    const io = req.app.locals.io;

    // Fetch current order to get existing status
    const currentOrder = await getOrderById(orderId);

    if (!currentOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Ownership enforcement — role alone is not enough:
    // a restaurant owner may only manage their own restaurant's orders, a
    // customer may only cancel their own order, and a delivery agent may only
    // update orders assigned to them.
    if (req.user.role === "CUSTOMER" && currentOrder.customerId !== req.user.userId) {
      return res.status(403).json({ message: "Not authorized for this order" });
    }
    if (req.user.role === "DELIVERY" && currentOrder.agentId !== req.user.userId) {
      return res.status(403).json({ message: "Order is not assigned to you" });
    }
    if (req.user.role === "RESTAURANT") {
      const { prisma } = await import("../../config/prisma.js");
      const owned = await prisma.restaurant.findFirst({
        where: { id: currentOrder.restaurantId, ownerId: req.user.userId },
        select: { id: true },
      });
      if (!owned) return res.status(403).json({ message: "Not authorized for this restaurant's orders" });
    }

    // Validate status transition based on user role
    const validationError = validateStatusUpdate(
      req.body,
      currentOrder.status,
      req.user.role
    );

    if (validationError) {
      return res.status(400).json({ message: validationError.message, ...validationError });
    }

    // Compute ETA for non-terminal status transitions
    const etaStatuses = ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"];
    let estimatedDelivery = currentOrder.estimatedDelivery ?? null;
    if (etaStatuses.includes(newStatus)) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: currentOrder.restaurantId },
        select: { lat: true, lng: true, address: true },
      });
      const agent = newStatus === "OUT_FOR_DELIVERY" && req.user.role === "DELIVERY"
        ? await prisma.user.findUnique({ where: { id: req.user.userId }, select: { currentLat: true, currentLng: true } })
        : null;
      estimatedDelivery = computeETA(restaurant, agent, newStatus, currentOrder.deliveryAddress);
    }

    // Update order status (and persist ETA)
    const updatedOrder = await updateOrderStatus({
      orderId,
      status: newStatus,
      agentId: req.user.role === "DELIVERY" ? req.user.userId : undefined,
      estimatedDelivery: estimatedDelivery ?? undefined,
    });

    // Assign a delivery agent on CONFIRMED, and retry on every later
    // transition (PREPARING, OUT_FOR_DELIVERY) if still unassigned — e.g. no
    // rider was online at CONFIRMED time but one came online since. Without
    // this retry, an order that missed its first assignment attempt is
    // stuck with agentId=null forever; a periodic job also retries (see
    // jobs/orderTimeout.job.js) for orders nobody touches again after this.
    const assignableStatuses = ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY"];
    if (assignableStatuses.includes(newStatus) && !updatedOrder.agentId && io) {
      const assignedAgent = await assignDeliveryAgent(orderId, io);
      if (!assignedAgent) {
        logger.warn("No agents available for order", { orderId, status: newStatus });
      }
    }

    // Emit socket event to notify all parties
    if (io) {
      emitOrderStatusUpdated({
        orderId,
        restaurantId: currentOrder.restaurantId,
        agentId: updatedOrder.agentId,
        status: newStatus,
        estimatedDelivery: estimatedDelivery instanceof Date
          ? estimatedDelivery.toISOString()
          : (estimatedDelivery ?? null),
        timestamp: new Date().toISOString(),
      });
    }

    // Notify customer based on new status
    const customerId = updatedOrder.customerId;
    if (newStatus === "CONFIRMED") {
      createNotification({ userId: customerId, title: "Restaurant confirmed your order", body: "Your order is being prepared.", type: "ORDER_UPDATE", entityId: orderId });
    } else if (newStatus === "OUT_FOR_DELIVERY" && updatedOrder.agent) {
      createNotification({ userId: customerId, title: "Rider assigned", body: `${updatedOrder.agent.name} is on the way.`, type: "ORDER_UPDATE", entityId: orderId });
    } else if (newStatus === "DELIVERED") {
      createNotification({ userId: customerId, title: "Order delivered!", body: "Enjoy your meal! Rate your experience.", type: "REVIEW_REQUEST", entityId: orderId });
    } else if (newStatus === "CANCELLED") {
      createNotification({
        userId: customerId,
        title: "Order cancelled",
        body: `${updatedOrder.restaurant?.name ?? "The restaurant"} cancelled your order.`,
        type: "ORDER_UPDATE",
        entityId: orderId,
      });
      // The rider may already have an active offer/assignment on this order
      // (cancellation can happen any time up to pickup) — let them know it's
      // off, separately from the customer-facing notification above.
      if (updatedOrder.agentId) {
        createNotification({
          userId: updatedOrder.agentId,
          title: "Order cancelled",
          body: "This order was cancelled by the restaurant — no pickup needed.",
          type: "ORDER_UPDATE",
          entityId: orderId,
        });
      }

      // Auto-refund a paid order on cancellation, reusing the existing
      // Cashfree refund flow (refund.service.js) rather than building a
      // second one — this is the same function the admin-initiated manual
      // refund endpoint calls. Idempotent (initiateRefund no-ops if a refund
      // already exists), and COD orders have no cfOrderId so this is a no-op
      // for them.
      if (updatedOrder.cfOrderId) {
        (async () => {
          try {
            const { initiateRefund } = await import("../payment/refund.service.js");
            await initiateRefund({
              cfOrderId: updatedOrder.cfOrderId,
              reason: "Order cancelled by restaurant",
              adminId: req.user.userId,
            });
          } catch (err) {
            logger.error("Auto-refund on order cancellation failed", { orderId, error: err.message });
          }
        })();
      }
    }

    // Fire-and-forget order status email
    if (["CONFIRMED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].includes(newStatus)) {
      (async () => {
        try {
          const { prisma } = await import("../../config/prisma.js");
          const user = await prisma.user.findUnique({ where: { id: customerId }, select: { email: true, name: true } });
          if (user?.email) {
            await sendOrderStatusEmail({
              to: user.email,
              name: user.name,
              orderId,
              status: newStatus,
              restaurantName: updatedOrder.restaurant?.name ?? "Restaurant",
            });
          }
        } catch { /* non-fatal */ }
      })();
    }

    return res.json({
      message: "Order status updated successfully",
      order: updatedOrder,
    });
  } catch (error) {
    logger.error("Order status update error", { error: error.message });
    return res.status(500).json({ message: "Unable to update order status" });
  }
};

// POST /api/orders/:id/reorder
// Builds a new cart payload from a past order, with availability checks.
export const reorderHTTP = async (req, res) => {
  try {
    const originalOrder = await getOrderById(req.params.id);
    if (!originalOrder) return res.status(404).json({ message: "Order not found" });
    if (originalOrder.customerId !== req.user.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const items = Array.isArray(originalOrder.items) ? originalOrder.items : [];
    if (items.length === 0) return res.status(400).json({ message: "Original order has no items" });

    const menuItemIds = items.map((i) => i.menuItemId);
    const available = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, restaurantId: originalOrder.restaurantId, isAvailable: true },
      select: { id: true, name: true, price: true, imageUrl: true },
    });
    const availableIds = new Set(available.map((m) => m.id));

    const reorderItems = items
      .filter((i) => availableIds.has(i.menuItemId))
      .map((i) => {
        const live = available.find((m) => m.id === i.menuItemId);
        return {
          menuItemId: i.menuItemId,
          name: i.name,
          quantity: i.quantity,
          price: Number(live.price),   // live price — may differ from original
          originalPrice: i.price,
          priceChanged: Number(live.price) !== i.price,
          imageUrl: live.imageUrl,
        };
      });

    const unavailable = items
      .filter((i) => !availableIds.has(i.menuItemId))
      .map((i) => i.name);

    res.json({
      restaurantId: originalOrder.restaurantId,
      restaurantName: originalOrder.restaurant?.name,
      items: reorderItems,
      unavailableItems: unavailable,
      partial: unavailable.length > 0,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to process reorder" });
  }
};
