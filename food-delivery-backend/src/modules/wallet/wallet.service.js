import { prisma } from "../../config/prisma.js";
import AppError from "../../utils/AppError.js";
import { logger } from "../../utils/logger.js";
import { getPlatformSettingsCached } from "../pricing/platformSettings.service.js";

// Wallet rows are created lazily on first read/write rather than at signup —
// most users never earn or redeem points, so this avoids a Wallet row for
// every CUSTOMER that ever registers.
async function getOrCreateWallet(userId) {
  return prisma.wallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function getWalletWithHistory(userId, { limit = 20 } = {}) {
  const wallet = await getOrCreateWallet(userId);
  const transactions = await prisma.walletTransaction.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
  return { balance: wallet.balance, transactions };
}

// Awards points for a DELIVERED order — only ever called from the DELIVERED
// transition (orders.controller.js), never on placement, so a cancelled
// order never earns anything. Rate is itemTotal-based (paise), not the
// customer-facing total, so fees/GST/delivery don't inflate earnings and a
// coupon-discounted order isn't double-rewarded on the platform's own margin.
export async function awardPointsForOrder(order) {
  const itemTotalPaise = order.itemTotal ?? order.subtotal ?? 0;
  if (itemTotalPaise <= 0) return null;

  const settings = await getPlatformSettingsCached();
  const itemTotalRupees = itemTotalPaise / 100;
  const points = Math.floor(itemTotalRupees * settings.loyaltyEarnRate);
  if (points <= 0) return null;

  const wallet = await getOrCreateWallet(order.customerId);
  const [, transaction] = await prisma.$transaction([
    prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: points } } }),
    prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "EARNED",
        points,
        orderId: order.id,
        description: `Earned on order #${order.id.slice(-6).toUpperCase()}`,
      },
    }),
  ]);

  logger.info("Loyalty points awarded", { orderId: order.id, customerId: order.customerId, points });
  return transaction;
}

// Computes how many of the requested points can actually be redeemed against
// an order of `orderTotalPaise`, honoring both the wallet balance and the
// admin-configured redemption cap (% of order value) — capped, not rejected,
// so a customer requesting slightly more than the cap still gets the max
// allowed rather than the redemption failing outright.
export async function previewRedemption({ userId, requestedPoints, orderTotalPaise }) {
  if (!requestedPoints || requestedPoints <= 0) return { points: 0, discountPaise: 0 };

  const settings = await getPlatformSettingsCached();
  const wallet = await getOrCreateWallet(userId);

  const maxByCapPaise = Math.floor((orderTotalPaise * settings.loyaltyRedemptionCapPct) / 100);
  const maxByCapPoints = Math.floor(maxByCapPaise / settings.loyaltyPointValuePaise);

  const points = Math.min(requestedPoints, wallet.balance, maxByCapPoints);
  const discountPaise = points * settings.loyaltyPointValuePaise;
  return { points, discountPaise, balance: wallet.balance, maxRedeemablePoints: Math.min(wallet.balance, maxByCapPoints) };
}

// Atomically claims `points` from the wallet for a redemption — guarded
// updateMany (balance >= points in the WHERE clause) so two concurrent
// orders can never both spend the same points, same pattern as the coupon
// usedCount claim in orders.service.js. Must be called from inside the same
// transaction that creates the order, so a failed order creation can't leave
// points debited with nothing to show for it.
export async function claimPointsInTx(tx, userId, points, { orderId, description } = {}) {
  if (!points || points <= 0) return;

  const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
  const claimed = await tx.wallet.updateMany({
    where: { id: wallet.id, balance: { gte: points } },
    data: { balance: { decrement: points } },
  });
  if (claimed.count === 0) {
    throw new AppError("Insufficient points balance", 400);
  }

  await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: "REDEEMED",
      points,
      orderId: orderId ?? null,
      description: description ?? "Redeemed at checkout",
    },
  });
}
