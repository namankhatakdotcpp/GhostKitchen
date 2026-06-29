import { customAlphabet } from "nanoid";
import { prisma } from "../../config/prisma.js";
import { creditWallet } from "../wallet/wallet.service.js";

const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 8);

export async function ensureReferralCode(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (user?.referralCode) return user.referralCode;

  let code;
  let attempts = 0;
  do {
    code = nanoid();
    attempts++;
    if (attempts > 20) throw new Error("Could not generate referral code");
  } while (await prisma.user.findFirst({ where: { referralCode: code } }));

  await prisma.user.update({ where: { id: userId }, data: { referralCode: code } });
  return code;
}

export async function applyReferralCode(refereeId, code) {
  const existing = await prisma.referral.findUnique({ where: { refereeId } });
  if (existing) throw new Error("You have already applied a referral code");

  const referrer = await prisma.user.findFirst({ where: { referralCode: code.trim().toUpperCase() } });
  if (!referrer) throw new Error("Invalid referral code");
  if (referrer.id === refereeId) throw new Error("You cannot refer yourself");

  return prisma.referral.create({
    data: { referrerId: referrer.id, refereeId, rewardPaise: 5000 },
  });
}

export async function getReferralStats(userId) {
  const code = await ensureReferralCode(userId);
  const referrals = await prisma.referral.findMany({
    where: { referrerId: userId },
    include: { referee: { select: { name: true, createdAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  const totalEarned = referrals.filter((r) => r.rewardedAt).reduce((s, r) => s + r.rewardPaise, 0);
  return { referralCode: code, referrals, totalEarned };
}

// Called after first DELIVERED order by a referred user
export async function processReferralReward(refereeId) {
  const referral = await prisma.referral.findUnique({ where: { refereeId } });
  if (!referral || referral.rewardedAt) return; // already rewarded or no referral

  await prisma.referral.update({ where: { refereeId }, data: { rewardedAt: new Date() } });

  // Credit ₹50 (in points at 100 paise/point = 50 points) to both
  const REWARD_POINTS = Math.round(referral.rewardPaise / 100);
  await Promise.all([
    creditWallet(referral.referrerId, REWARD_POINTS, `Referral reward — friend placed first order`),
    creditWallet(refereeId, REWARD_POINTS, `Welcome reward for joining via referral`),
  ]);
}
