/**
 * Order Queue (BullMQ)
 * 
 * Handles async jobs:
 * - Send confirmation emails
 * - Send order status notifications
 * - Payment confirmations
 * - Delivery partner assignment notifications
 * 
 * Benefits:
 * - Non-blocking API (don't wait for email to send)
 * - Automatic retries on failure
 * - Job scheduling support
 * - Scalable job processing
 */

import { Queue } from "bullmq";
import { redis } from "../config/redis.js";
import { logger } from "../utils/logger.js";

export const orderQueue = new Queue("orderQueue", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3, // Retry up to 3 times
    backoff: {
      type: "exponential",
      delay: 2000, // Start with 2s delay
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
    },
  },
});

// Event handlers
orderQueue.on("completed", (job) => {
  logger.info(`✓ Queue job completed: ${job.name}`, {
    jobId: job.id,
    data: job.data,
  });
});

orderQueue.on("failed", (job, error) => {
  logger.error(`❌ Queue job failed: ${job?.name}`, {
    jobId: job?.id,
    error: error.message,
    attempts: job?.attemptsMade,
  });
});

orderQueue.on("error", (error) => {
  logger.error("❌ Queue error", { error: error.message });
});

/**
 * Add job to send order confirmation email
 * 
 * @param {string} orderId - Order ID
 * @param {string} userEmail - Customer email
 * @param {object} orderData - Order details
 */
export const queueSendOrderConfirmation = async (orderId, userEmail, orderData) => {
  try {
    const job = await orderQueue.add("send-order-confirmation", {
      orderId,
      userEmail,
      orderData,
      timestamp: new Date().toISOString(),
    });

    logger.info("📧 Queued order confirmation email", {
      jobId: job.id,
      orderId,
      email: userEmail,
    });

    return job.id;
  } catch (error) {
    logger.error("Failed to queue confirmation email", {
      orderId,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Add job to send order status update notification
 * 
 * @param {string} orderId - Order ID
 * @param {string} userEmail - Customer email
 * @param {string} status - New status
 */
export const queueSendStatusUpdate = async (orderId, userEmail, status) => {
  try {
    const job = await orderQueue.add("send-status-update", {
      orderId,
      userEmail,
      status,
      timestamp: new Date().toISOString(),
    });

    logger.info("📧 Queued status update email", {
      jobId: job.id,
      orderId,
      status,
    });

    return job.id;
  } catch (error) {
    logger.error("Failed to queue status update", {
      orderId,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Add job for delivery partner assignment notification
 * 
 * @param {string} orderId - Order ID
 * @param {string} deliveryPartnerEmail - Partner email
 * @param {object} orderData - Order details
 */
export const queueDeliveryNotification = async (orderId, deliveryPartnerEmail, orderData) => {
  try {
    const job = await orderQueue.add("delivery-partner-assigned", {
      orderId,
      deliveryPartnerEmail,
      orderData,
      timestamp: new Date().toISOString(),
    });

    logger.info("📦 Queued delivery notification", {
      jobId: job.id,
      orderId,
      partner: deliveryPartnerEmail,
    });

    return job.id;
  } catch (error) {
    logger.error("Failed to queue delivery notification", {
      orderId,
      error: error.message,
    });
    throw error;
  }
};

/**
 * Add job for payment confirmation
 * 
 * @param {string} orderId - Order ID
 * @param {string} paymentId - Payment ID
 * @param {number} amount - Amount in rupees
 */
export const queuePaymentConfirmation = async (orderId, paymentId, amount) => {
  try {
    const job = await orderQueue.add("payment-confirmation", {
      orderId,
      paymentId,
      amount,
      timestamp: new Date().toISOString(),
    });

    logger.info("💳 Queued payment confirmation", {
      jobId: job.id,
      orderId,
      paymentId,
    });

    return job.id;
  } catch (error) {
    logger.error("Failed to queue payment confirmation", {
      orderId,
      error: error.message,
    });
    throw error;
  }
};

export default orderQueue;
