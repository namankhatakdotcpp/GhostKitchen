import cron from "node-cron";
import { prisma } from "../config/prisma.js";
import { logger } from "../utils/logger.js";

/**
 * Order Timeout Job
 * 
 * Runs every 5 minutes
 * Cancels orders that are:
 * - Status: PENDING
 * - Payment Status: PENDING
 * - Created more than 15 minutes ago
 * 
 * This prevents orders from hanging indefinitely if payment fails silently
 */

const ORDER_TIMEOUT_MINUTES = 15;

export const startOrderTimeoutJob = () => {
  // Run every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    try {
      logger.info("Order timeout job started");

      const timeoutTime = new Date(Date.now() - ORDER_TIMEOUT_MINUTES * 60 * 1000);

      // Cancel all expired orders in a single atomic operation
      // This is more efficient than finding IDs first then updating
      const result = await prisma.order.updateMany({
        where: {
          status: "PENDING",
          paymentStatus: "PENDING",
          createdAt: {
            lt: timeoutTime,
          },
        },
        data: {
          status: "CANCELLED",
          paymentStatus: "FAILED", // Mark as failed since payment wasn't received
        },
      });

      if (result.count === 0) {
        logger.info("No expired orders found");
        return;
      }

      logger.info("Order timeout job completed", {
        cancelledCount: result.count,
      });
    } catch (error) {
      logger.error("Order timeout job error", {
        error: error.message,
      });
    }
  });

  logger.info("Order timeout job started (runs every 5 minutes)");
};

export default startOrderTimeoutJob;
