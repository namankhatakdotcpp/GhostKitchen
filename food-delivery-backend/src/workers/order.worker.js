/**
 * Order Worker
 * 
 * Processes async jobs from orderQueue:
 * - Send confirmation emails
 * - Send status updates
 * - Notify delivery partners
 * - Payment confirmations
 * 
 * WHY separate process:
 * - Not blocking API responses
 * - Can be scaled independently
 * - Automatic retry on failure
 * - Job persistence in Redis
 * 
 * RUN: node src/workers/order.worker.js
 */

import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { logger } from "../utils/logger.js";

// In production, use real email service (SendGrid, AWS SES, etc.)
// For now, log to console
const sendEmail = async (email, subject, body) => {
  logger.info(`📧 Email would be sent to: ${email}`, {
    subject,
    body: body.substring(0, 100) + "...",
  });

  // TODO: Integrate with real email service
  // const result = await sendgrid.send({
  //   to: email,
  //   from: "noreply@ghostkitchen.app",
  //   subject,
  //   html: body,
  // });
};

const orderWorker = new Worker(
  "orderQueue",
  async (job) => {
    logger.info(`🔄 Processing job: ${job.name}`, {
      jobId: job.id,
      data: job.data,
    });

    try {
      switch (job.name) {
        case "send-order-confirmation":
          return await handleSendConfirmation(job.data);

        case "send-status-update":
          return await handleSendStatusUpdate(job.data);

        case "delivery-partner-assigned":
          return await handleDeliveryNotification(job.data);

        case "payment-confirmation":
          return await handlePaymentConfirmation(job.data);

        default:
          throw new Error(`Unknown job type: ${job.name}`);
      }
    } catch (error) {
      logger.error(`❌ Job failed: ${job.name}`, {
        jobId: job.id,
        error: error.message,
        stack: error.stack,
      });
      throw error; // BullMQ will handle retries
    }
  },
  {
    connection: redis,
    // Concurrency: How many jobs to process simultaneously
    concurrency: 5,
  }
);

/**
 * Send order confirmation email
 */
async function handleSendConfirmation(data) {
  const { orderId, userEmail, orderData } = data;

  const subject = `Order Confirmed - #${orderId.slice(0, 8)}`;
  const body = `
    <h2>Order Confirmed!</h2>
    <p>Thank you for your order.</p>
    <p><strong>Order ID:</strong> ${orderId}</p>
    <p><strong>Total Amount:</strong> ₹${orderData.totalAmount / 100}</p>
    <p>Track your order status in the app.</p>
  `;

  await sendEmail(userEmail, subject, body);
  logger.info(`✓ Confirmation email sent`, { orderId, email: userEmail });
  return { success: true, email: userEmail };
}

/**
 * Send status update notification
 */
async function handleSendStatusUpdate(data) {
  const { orderId, userEmail, status } = data;

  const statusMessages = {
    PENDING: "Your order has been received",
    CONFIRMED: "Your order has been confirmed",
    PREPARING: "Your order is being prepared",
    OUT_FOR_DELIVERY: "Your order is on the way",
    DELIVERED: "Your order has been delivered",
    CANCELLED: "Your order has been cancelled",
  };

  const subject = `Order Status Update - ${status}`;
  const body = `
    <h2>Order Status Update</h2>
    <p>${statusMessages[status] || "Your order status has been updated"}</p>
    <p><strong>Order ID:</strong> ${orderId}</p>
    <p>Check the app for more details.</p>
  `;

  await sendEmail(userEmail, subject, body);
  logger.info(`✓ Status update email sent`, { orderId, status });
  return { success: true, status };
}

/**
 * Notify delivery partner of assignment
 */
async function handleDeliveryNotification(data) {
  const { orderId, deliveryPartnerEmail, orderData } = data;

  const subject = `New Delivery Assignment - ${orderId.slice(0, 8)}`;
  const body = `
    <h2>New Delivery Assigned</h2>
    <p>You have been assigned a new delivery.</p>
    <p><strong>Restaurant:</strong> ${orderData.restaurant?.name}</p>
    <p><strong>Pickup Address:</strong> ${orderData.restaurant?.address}</p>
    <p>Accept the delivery in the app.</p>
  `;

  await sendEmail(deliveryPartnerEmail, subject, body);
  logger.info(`✓ Delivery notification sent`, { orderId, partner: deliveryPartnerEmail });
  return { success: true, partner: deliveryPartnerEmail };
}

/**
 * Send payment confirmation
 */
async function handlePaymentConfirmation(data) {
  const { orderId, paymentId, amount } = data;

  const subject = `Payment Received - #${paymentId.slice(0, 8)}`;
  const body = `
    <h2>Payment Confirmed</h2>
    <p>We have received your payment.</p>
    <p><strong>Amount:</strong> ₹${amount / 100}</p>
    <p><strong>Payment ID:</strong> ${paymentId}</p>
    <p>Your order will be prepared shortly.</p>
  `;

  // In production, email user about payment confirmation
  logger.info(`✓ Payment confirmation processed`, { orderId, paymentId });
  return { success: true, paymentId };
}

// Worker event handlers
orderWorker.on("completed", (job) => {
  logger.info(`✅ Worker job completed: ${job.name}`, {
    jobId: job.id,
    processingTime: job.finishedOn - job.processedOn,
  });
});

orderWorker.on("failed", (job, error) => {
  logger.error(`❌ Worker job failed: ${job.name}`, {
    jobId: job.id,
    error: error.message,
    attempts: job.attemptsMade,
    nextRetry: job.nextProcessableOn,
  });
});

orderWorker.on("error", (error) => {
  logger.error("❌ Worker error", { error: error.message });
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("🛑 Worker shutting down gracefully...");
  await orderWorker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("🛑 Worker interrupted");
  await orderWorker.close();
  process.exit(0);
});

logger.info("✓ Order worker started and listening for jobs");

export default orderWorker;
