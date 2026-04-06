import Cashfree from "cashfree-pg";
import { v4 as uuid } from "uuid";
import { prisma } from "../../config/prisma.js";
import { createOrder, calculateOrderTotal } from "../orders/orders.service.js";
import { emitOrderNew } from "../../socket/socket.server.js";

// Initialize Cashfree SDK
const initializeCashfree = () => {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;

  if (!appId || !secretKey) {
    console.warn("⚠️  Cashfree credentials not configured. Payment features will not work.");
    return false;
  }

  Cashfree.XClientId = appId;
  Cashfree.XClientSecret = secretKey;

  // Set environment - use string value directly
  const env = process.env.CASHFREE_ENV || "TEST";
  Cashfree.XEnvironment = env === "PRODUCTION" ? "PRODUCTION" : "TEST";

  console.log(`✓ Cashfree initialized in ${Cashfree.XEnvironment} mode`);
  return true;
};

const cashfreeReady = initializeCashfree();

export async function createPaymentOrder(req, res) {
  try {
    const { restaurantId, items, deliveryAddress, couponCode } = req.body;
    const customerId = req.user.userId;

    // Input validation
    if (!restaurantId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Invalid request. Items required." });
    }

    // Check if payment already exists (idempotency prevention)
    const existingPayment = await prisma.payment.findFirst({
      where: {
        customerId,
        restaurantId,
        status: "PENDING",
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }, // within 5 minutes
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingPayment) {
      return res.status(409).json({
        message: "Payment already in progress. Please complete or cancel the existing payment.",
        cfOrderId: existingPayment.cfOrderId,
      });
    }

    // 1. Fetch customer details
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, name: true, email: true, phone: true },
    });

    if (!customer) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Calculate server-side total (reuse same logic as order creation)
    const { subtotal, deliveryFee, discount, total } =
      await calculateOrderTotal({
        restaurantId,
        items,
        couponCode,
      });

    // 3. Create a unique order ID for Cashfree
    const cfOrderId = `GK-${uuid().slice(0, 8).toUpperCase()}`;

    // 4. Create Cashfree payment session
    const orderRequest = {
      order_id: cfOrderId,
      order_amount: total / 100, // Cashfree uses rupees (not paise)
      order_currency: "INR",
      order_note: `GhostKitchen order from ${customer.name}`,
      customer_details: {
        customer_id: customer.id,
        customer_name: customer.name ?? "Customer",
        customer_email: customer.email,
        customer_phone: customer.phone ?? "9999999999",
      },
      order_meta: {
        return_url: `${process.env.FRONTEND_URL}/checkout/callback?order_id={order_id}`,
        notify_url: `${process.env.BACKEND_URL}/api/payments/webhook`,
      },
    };

    const response = await Cashfree.PGCreateOrder("2023-08-01", orderRequest);
    const cfData = response.data;

    console.log(`✓ Cashfree order created: ${cfOrderId}`, {
      amount: total / 100,
      sessionId: cfData.payment_session_id,
    });
    
    // Store amount as integer paise to match DB Int type and prevent rounding errors
    const amountInPaise = Math.round(total * 100);
    
    await prisma.payment.create({
      data: {
        cfOrderId,
        customerId,
        restaurantId,
        amount: amountInPaise, // Integer paise instead of Decimal rupees
        status: "PENDING",
        itemsSnapshot: JSON.stringify(items),
        deliveryAddress: JSON.stringify(deliveryAddress),
        couponCode: couponCode ?? null,
      },
    });

    return res.json({
      cfOrderId,
      paymentSessionId: cfData.payment_session_id,
      orderAmount: total / 100,
      deliveryFee, // Return backend-calculated delivery fee to frontend for display consistency
      subtotal,
      discount,
      total,
    });
  } catch (error) {
    console.error("❌ Cashfree create order error:", {
      message: error.message,
      code: error.code,
      status: error.status,
      details: error.errorParameters,
    });

    // Return specific error based on type
    if (error.status === 400) {
      return res.status(400).json({
        message: "Invalid payment request. Please try again.",
        error: error.message,
      });
    }

    if (error.message?.includes("Cashfree")) {
      return res.status(502).json({
        message: "Payment gateway unavailable. Please try again later.",
      });
    }

    return res.status(500).json({
      message: "Failed to create payment order",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}

export async function verifyPayment(req, res) {
  try {
    const { cfOrderId } = req.body;
    const customerId = req.user.userId;

    if (!cfOrderId) {
      return res.status(400).json({ message: "cfOrderId is required" });
    }

    // 1. Fetch order status from Cashfree with error handling
    let response;
    try {
      response = await Cashfree.PGFetchOrder("2023-08-01", cfOrderId);
    } catch (cfError) {
      console.error("Cashfree API error:", cfError);
      return res.status(502).json({
        message: "Payment verification failed. Please contact support.",
      });
    }

    const cfOrder = response?.data;

    // Null safety: ensure response has required data
    if (!cfOrder || !cfOrder.order_status) {
      console.error("Invalid Cashfree response:", response);
      return res.status(502).json({
        message: "Invalid response from payment gateway",
      });
    }

    if (cfOrder.order_status !== "PAID") {
      return res.status(400).json({
        message: "Payment not completed",
        status: cfOrder.order_status,
      });
    }

    // 2. Find the pending payment record
    const pendingPayment = await prisma.payment.findUnique({
      where: { cfOrderId },
    });

    if (!pendingPayment) {
      return res.status(404).json({ message: "Payment record not found" });
    }

    if (pendingPayment.customerId !== customerId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (pendingPayment.status === "SUCCESS") {
      // Already processed (duplicate webhook) — return existing order
      const existingOrder = await prisma.order.findFirst({
        where: { cfOrderId },
      });
      return res.json({ orderId: existingOrder.id, success: true });
    }

    // 3. Create the actual order in DB
    const items = JSON.parse(pendingPayment.itemsSnapshot);
    const deliveryAddress = JSON.parse(pendingPayment.deliveryAddress);

    const order = await createOrder(
      {
        restaurantId: pendingPayment.restaurantId,
        items,
        deliveryAddress,
        couponCode: pendingPayment.couponCode,
      },
      customerId
    );

    // Update order with cfOrderId
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: { cfOrderId },
      include: { restaurant: true, agent: true },
    });

    // 4. Mark payment as SUCCESS with correct Cashfree response field
    await prisma.payment.update({
      where: { cfOrderId },
      data: {
        status: "SUCCESS",
        cfPaymentId: cfOrder.order_id?.toString(), // FIXED: was cf_order_id (wrong field)
      },
    });

    // 5. Emit real-time events using proper socket emitters
    try {
      emitOrderNew({
        restaurantId: pendingPayment.restaurantId,
        order: updatedOrder,
      });
    } catch (socketError) {
      console.warn("Socket emission failed (order still created):", socketError);
      // Don't fail - order was already created successfully in DB
    }

    return res.json({ orderId: updatedOrder.id, success: true });
  } catch (error) {
    console.error("❌ Cashfree verify error:", {
      cfOrderId: req.body.cfOrderId,
      message: error.message,
      code: error.code,
    });

    if (error.message?.includes("order") || error.message?.includes("not found")) {
      return res.status(404).json({
        message: "Order not found or payment verification failed",
      });
    }

    return res.status(500).json({
      message: "Payment verification failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}
