import { Cashfree } from "cashfree-pg";
import { v4 as uuid } from "uuid";
import { prisma } from "../../config/prisma.js";
import { createOrder, calculateOrderTotal } from "../orders/orders.service.js";

Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;
Cashfree.XEnvironment =
  process.env.CASHFREE_ENV === "PRODUCTION"
    ? Cashfree.Environment.PRODUCTION
    : Cashfree.Environment.SANDBOX;

export async function createPaymentOrder(req, res) {
  try {
    const { restaurantId, items, deliveryAddress, couponCode } = req.body;
    const customerId = req.user.userId;

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

    // 5. Store pending payment record so we can verify later
    await prisma.payment.create({
      data: {
        cfOrderId,
        customerId,
        restaurantId,
        amount: total,
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
    });
  } catch (error) {
    console.error("Cashfree create order error:", error);
    return res.status(500).json({ message: "Failed to create payment order" });
  }
}

export async function verifyPayment(req, res) {
  try {
    const { cfOrderId } = req.body;
    const customerId = req.user.userId;

    // 1. Fetch order status from Cashfree
    const response = await Cashfree.PGFetchOrder("2023-08-01", cfOrderId);
    const cfOrder = response.data;

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

    // 4. Mark payment as SUCCESS
    await prisma.payment.update({
      where: { cfOrderId },
      data: {
        status: "SUCCESS",
        cfPaymentId: cfOrder.cf_order_id?.toString(),
      },
    });

    // 5. Emit real-time events
    const io = req.app.locals.io;
    if (io) {
      io.to(`shop-${pendingPayment.restaurantId}`).emit("order:new", {
        order,
      });
      io.to("admin").emit("order:new", { order });
    }

    return res.json({ orderId: updatedOrder.id, success: true });
  } catch (error) {
    console.error("Cashfree verify error:", error);
    return res.status(500).json({ message: "Payment verification failed" });
  }
}
