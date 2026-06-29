import { prisma } from "../../config/prisma.js";

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// Admin: create gift card
export async function adminCreateGiftCard({ valuePaise, purchasedByUserId = null, expiresAt = null }) {
  let code;
  let attempts = 0;
  do {
    code = randomCode();
    attempts++;
    if (attempts > 10) throw new Error("Could not generate unique code");
  } while (await prisma.giftCard.findUnique({ where: { code } }));

  return prisma.giftCard.create({
    data: {
      code,
      originalValuePaise: valuePaise,
      remainingValuePaise: valuePaise,
      purchasedByUserId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });
}

export async function adminListGiftCards() {
  return prisma.giftCard.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      purchasedBy: { select: { id: true, name: true, email: true } },
      redeemedBy: { select: { id: true, name: true, email: true } },
    },
    take: 200,
  });
}

// Check a gift card balance (public)
export async function checkGiftCard(code) {
  const card = await prisma.giftCard.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!card) throw new Error("Gift card not found");
  if (card.expiresAt && new Date() > card.expiresAt) throw new Error("Gift card has expired");
  if (card.remainingValuePaise <= 0) throw new Error("Gift card has no remaining balance");
  return card;
}

// Apply gift card at checkout — returns {discountPaise, newRemainingPaise}
// Must be called inside a transaction or with a manual follow-up update
export async function redeemGiftCard(code, orderTotalPaise, userId) {
  const card = await checkGiftCard(code);
  const discountPaise = Math.min(card.remainingValuePaise, orderTotalPaise);
  const newRemainingPaise = card.remainingValuePaise - discountPaise;

  await prisma.giftCard.update({
    where: { id: card.id },
    data: {
      remainingValuePaise: newRemainingPaise,
      redeemedByUserId: userId,
      updatedAt: new Date(),
    },
  });

  return { discountPaise, newRemainingPaise };
}
