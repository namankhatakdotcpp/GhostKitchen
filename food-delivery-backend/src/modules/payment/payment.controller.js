import * as paymentService from "./payment.service.js";
import { verifyCashfreeSignature } from "../../utils/cashfree.js";
import { logger } from "../../utils/logger.js";
import AppError from "../../utils/AppError.js";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import cashfree from "../../config/cashfree.js";
import { v4 as uuid } from "uuid";
import { calculateOrderTotal } from "../orders/orders.service.js";
import { emitOrderNew } from "../../socket/socket.server.js";
import { createNotification } from "../notification/notification.service.js";

/**
 * Payment Controller - HTTP Handlers
 * 
 * Routes:
 * - POST /api/payments/create-session → Create payment for order
 * - POST /api/payments/webhook → Receive webhook from Cashfree
 * - GET /api/payments/verify/:orderId → Check payment status
 */

/**
 * POST /api/payments/create-session
 * Create payment session for order
 * 
 * Request:
 * {
 *   "orderId": "order-uuid"
 * }
 * 
 * Response:
 * {
 *   "order_id": "order-uuid",
 *   "payment_session_id": "session-id",
 *   "amount": 599.99,
 *   "currency": "INR"
 * }
 */
export const createSession = async (req, res, next) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const session = await paymentService.createPaymentSession(
      orderId,
      req.user
    );

    res.json({
      success: true,
      message: "Payment session created",
      data: session,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/webhook
 * Receive payment status updates from Cashfree
 * 
 * 🔐 CRITICAL: Verifies webhook signature from Cashfree
 * This prevents spoofed payment confirmations
 * 
 * 🔐 NOTE: This endpoint should NOT require authentication
 * It's called by Cashfree servers, not your frontend
 */
export const webhook = async (req, res, next) => {
  try {
    // 1️⃣ VERIFY SIGNATURE (CRITICAL SECURITY CHECK)
    // Cashfree can send signature in either header name
    const signature =
      req.headers["x-webhook-signature"] ||
      req.headers["x-cf-signature"];
    const rawBody = req.rawBody || req.body; // Use stored raw body for signature verification

    // Always return 200 to acknowledge receipt (prevent DOS from retries)
    if (!signature) {
      logger.warn("Webhook missing signature header");
      return res.status(200).json({
        received: true,
        message: "Missing webhook signature",
      });
    }

    // Convert raw body to string if it's a Buffer
    let rawBodyString = rawBody;
    if (Buffer.isBuffer(rawBody)) {
      rawBodyString = rawBody.toString();
    } else if (typeof rawBody !== "string") {
      rawBodyString = JSON.stringify(rawBody);
    }

    const isValid = verifyCashfreeSignature(
      rawBodyString,
      signature,
      env.CASHFREE_CLIENT_SECRET
    );

    if (!isValid) {
      logger.warn("Webhook signature verification failed", {
        provided: signature.substring(0, 10) + "...",
      });
      // Return 200 to acknowledge (don't let Cashfree keep retrying)
      return res.status(200).json({
        received: true,
        message: "Signature verification failed",
      });
    }

    // 2️⃣ PARSE WEBHOOK DATA (NOW VERIFIED)
    // The raw body from app.js is a Buffer, so we need to convert it
    let webhookData;
    try {
      let bodyToParse = req.body;
      
      // If body is still a Buffer (from express.raw()), convert to string first
      if (Buffer.isBuffer(bodyToParse)) {
        bodyToParse = bodyToParse.toString();
      }
      
      // Parse JSON if it's a string
      if (typeof bodyToParse === "string") {
        webhookData = JSON.parse(bodyToParse);
      } else {
        webhookData = bodyToParse;
      }
    } catch (parseErr) {
      logger.error("Malformed JSON in webhook payload", {
        rawBody: typeof req.body === "string" ? req.body.substring(0, 100) : (Buffer.isBuffer(req.body) ? req.body.toString().substring(0, 100) : JSON.stringify(req.body).substring(0, 100)),
        parseError: parseErr.message,
      });
      // Return 200 to acknowledge receipt (prevent Cashfree retries on parse errors)
      return res.status(200).json({
        received: true,
        message: "invalid payload format",
      });
    }

    // 3️⃣ PROCESS WEBHOOK
    const success = await paymentService.handlePaymentWebhook(webhookData);

    // Always return 200 success (webhook was received and processed)
    return res.status(200).json({
      received: true,
      processed: success,
    });
  } catch (err) {
    logger.error("Webhook error", {
      error: err.message,
      stack: err.stack,
    });
    // Even on error, return 200 to prevent Cashfree DOS retries
    return res.status(200).json({
      received: true,
      error: err.message,
    });
  }
};

/**
 * GET /api/payments/verify/:orderId
 * Verify payment status (optional, for reconciliation)
 */
export const verifyPayment = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    const status = await paymentService.verifyPaymentStatus(orderId);

    res.json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/create-order
 * Create Cashfree payment session for new order (without creating the DB order first)
 * Cart-free flow: items sent in request body, order created after payment verification
 */
export const createPaymentOrder = async (req, res, next) => {
  try {
    const { restaurantId, items, deliveryAddress, couponCode } = req.body;
    const customerId = req.user.userId;

    if (!restaurantId || !items?.length || !deliveryAddress) {
      return res.status(400).json({ message: "restaurantId, items, and deliveryAddress are required" });
    }

    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!customer) return res.status(404).json({ message: "User not found" });

    const { subtotal, deliveryFee, discount, total } = await calculateOrderTotal({
      restaurantId,
      items,
      couponCode,
    });

    const cfOrderId = `GK-${uuid().slice(0, 8).toUpperCase()}`;

    const request = {
      order_id: cfOrderId,
      order_amount: (total / 100).toFixed(2),
      order_currency: "INR",
      customer_details: {
        customer_id: customer.id,
        customer_name: customer.name || "Customer",
        customer_email: customer.email,
        customer_phone: customer.phone || "9999999999",
      },
      order_meta: {
        return_url: `${env.FRONTEND_URL}/checkout/callback?order_id={order_id}`,
        notify_url: `${env.BACKEND_URL}/api/payments/webhook`,
      },
      order_note: "GhostKitchen order",
    };

    let paymentSessionId;
    try {
      const response = await cashfree.PGCreateOrder(request);
      paymentSessionId = response.payment_session_id;
    } catch (cfErr) {
      logger.error("Cashfree create order failed", { error: cfErr.message });
      return res.status(502).json({ message: "Payment gateway error. Please try again." });
    }

    await prisma.payment.create({
      data: {
        cfOrderId,
        customerId,
        restaurantId,
        amount: total,
        status: "PENDING",
        itemsSnapshot: JSON.stringify(items),
        deliveryAddress: JSON.stringify(deliveryAddress),
        couponCode: couponCode || null,
      },
    });

    return res.json({
      cfOrderId,
      paymentSessionId,
      orderAmount: total / 100,
      deliveryFee,
    });
  } catch (error) {
    if (error.message?.includes("Invalid items") || error.message?.includes("coupon")) {
      return res.status(400).json({ message: error.message });
    }
    logger.error("Create payment order error", { error: error.message });
    next(error);
  }
};

/**
 * POST /api/payments/verify
 * Verify Cashfree payment then create the order record
 */
export const verifyPaymentAndCreateOrder = async (req, res, next) => {
  try {
    const { cfOrderId } = req.body;
    const customerId = req.user.userId;

    if (!cfOrderId) return res.status(400).json({ message: "cfOrderId is required" });

    const pendingPayment = await prisma.payment.findUnique({ where: { cfOrderId } });
    if (!pendingPayment) return res.status(404).json({ message: "Payment record not found" });
    if (pendingPayment.customerId !== customerId) return res.status(403).json({ message: "Forbidden" });

    // Idempotency: already processed → return existing order
    if (pendingPayment.status === "SUCCESS") {
      const existingOrder = await prisma.order.findFirst({ where: { cfOrderId } });
      return res.json({ orderId: existingOrder?.id, success: true });
    }

    // Verify with Cashfree
    let cfOrderStatus;
    try {
      const response = await cashfree.PGFetchOrder("2025-01-01", cfOrderId);
      cfOrderStatus = response.data?.order_status ?? response.order_status;
    } catch (cfErr) {
      logger.error("Cashfree fetch order failed", { cfOrderId, error: cfErr.message });
      return res.status(502).json({ message: "Could not verify payment with gateway" });
    }

    if (cfOrderStatus !== "PAID") {
      return res.status(400).json({ message: "Payment not completed", status: cfOrderStatus });
    }

    const parsedItems = JSON.parse(pendingPayment.itemsSnapshot);
    const parsedAddress = JSON.parse(pendingPayment.deliveryAddress);

    const { orderItems, subtotal, deliveryFee, discount, total } = await calculateOrderTotal({
      restaurantId: pendingPayment.restaurantId,
      items: parsedItems,
      couponCode: pendingPayment.couponCode,
    });

    const order = await prisma.order.create({
      data: {
        customerId,
        restaurantId: pendingPayment.restaurantId,
        status: "PLACED",
        items: orderItems,
        subtotal,
        deliveryFee,
        discount,
        total,
        deliveryAddress: parsedAddress,
        cfOrderId,
      },
      include: { restaurant: true },
    });

    await prisma.payment.update({
      where: { cfOrderId },
      data: { status: "SUCCESS" },
    });

    emitOrderNew({ restaurantId: pendingPayment.restaurantId, order });

    // Notify customer and restaurant owner
    createNotification({
      userId: customerId,
      title: "Order placed!",
      body: "Your order is being prepared.",
      type: "ORDER_UPDATE",
      entityId: order.id,
    });
    if (order.restaurant?.ownerId) {
      createNotification({
        userId: order.restaurant.ownerId,
        title: "New order!",
        body: `Order #${order.id.slice(-6).toUpperCase()} received.`,
        type: "ORDER_UPDATE",
        entityId: order.id,
      });
    }

    return res.json({ orderId: order.id, success: true });
  } catch (error) {
    logger.error("Verify payment error", { error: error.message });
    next(error);
  }
};

/**
 * GET /api/payments/history
 * Get payment history for the logged-in customer
 */
export const getPaymentHistory = async (req, res, next) => {
  try {
    const customerId = req.user.userId;
    const payments = await prisma.payment.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Enrich with order data via cfOrderId
    const enriched = await Promise.all(
      payments.map(async (p) => {
        const order = await prisma.order.findFirst({
          where: { cfOrderId: p.cfOrderId },
          include: { restaurant: { select: { name: true } } },
        });
        return {
          id: p.id,
          cfOrderId: p.cfOrderId,
          amount: p.amount,
          status: p.status,
          createdAt: p.createdAt,
          orderId: order?.id ?? null,
          restaurantName: order?.restaurant?.name ?? null,
          items: order?.items ?? JSON.parse(p.itemsSnapshot || "[]"),
        };
      })
    );

    res.json({ payments: enriched });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/payments/retry/:orderId
 * Retry payment for a failed order
 * 
 * Checks:
 * - Order exists
 * - Payment status is FAILED
 * - User owns the order
 * 
 * Returns new payment session
 */
export const retryPayment = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required",
      });
    }

    // 1️⃣ FETCH ORDER
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      logger.warn("Retry payment attempted on non-existent order", {
        orderId,
        userId,
        timestamp: new Date(),
      });
      throw new AppError("Order not found", 404);
    }

    if (order.customerId !== userId) {
      logger.error("Unauthorized payment retry attempt", {
        orderId,
        requestedBy: userId,
        orderOwner: order.customerId,
      });
      throw new AppError("Unauthorized to retry payment for this order", 403);
    }

    if (order.status !== "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Can only retry payment for cancelled orders.",
      });
    }

    // 4️⃣ CREATE NEW PAYMENT SESSION
    const session = await paymentService.createPaymentSession(
      orderId,
      req.user
    );

    logger.info("Payment retry initiated successfully", {
      orderId,
      userId,
      amount: order.total,
      newSessionId: session.payment_session_id,
      timestamp: new Date(),
    });

    res.json({
      success: true,
      message: "Payment session created for retry",
      data: session,
    });
  } catch (err) {
    next(err);
  }
};
