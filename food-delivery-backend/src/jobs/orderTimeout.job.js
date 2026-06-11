import cron from "node-cron";
import { prisma } from "../config/prisma.js";
import { logger } from "../utils/logger.js";

/**
 * Housekeeping job — runs every 10 minutes.
 *
 * 1. Expire stale payment intents: Payment rows stuck in PENDING for >30 min
 *    (user opened checkout and never paid). Keeps payment history clean and
 *    stops them being picked up by /payments/verify later.
 * 2. Purge expired refresh tokens so the table doesn't grow forever.
 *
 * NOTE: the previous version updated Order rows by a `paymentStatus` column
 * that doesn't exist on the Order model — it threw a Prisma validation error
 * on every run and never did anything.
 */

const PAYMENT_TIMEOUT_MINUTES = 30;

export const startOrderTimeoutJob = () => {
  cron.schedule("*/10 * * * *", async () => {
    try {
      const cutoff = new Date(Date.now() - PAYMENT_TIMEOUT_MINUTES * 60 * 1000);

      const stale = await prisma.payment.updateMany({
        where: { status: "PENDING", createdAt: { lt: cutoff } },
        data: { status: "FAILED" },
      });

      const tokens = await prisma.refreshToken.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });

      if (stale.count > 0 || tokens.count > 0) {
        logger.info("Housekeeping job completed", {
          expiredPayments: stale.count,
          purgedRefreshTokens: tokens.count,
        });
      }
    } catch (error) {
      logger.error("Housekeeping job error", { error: error.message });
    }
  });

  logger.info("Housekeeping job scheduled (every 10 minutes)");
};

export default startOrderTimeoutJob;
