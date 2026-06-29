-- Feature parity migration: add-ons, scheduled orders, referrals, gift cards, support tickets, chat

-- Add scheduledFor to Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);

-- Add addons JSON to CartItem
ALTER TABLE "CartItem" ADD COLUMN IF NOT EXISTS "addons" JSONB;

-- Add referralCode to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");

-- AddonGroup
CREATE TABLE IF NOT EXISTS "AddonGroup" (
  "id"          TEXT NOT NULL,
  "menuItemId"  TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "required"    BOOLEAN NOT NULL DEFAULT false,
  "multiSelect" BOOLEAN NOT NULL DEFAULT false,
  "maxSelect"   INTEGER,
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AddonGroup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AddonGroup_menuItemId_fkey" FOREIGN KEY ("menuItemId")
    REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AddonGroup_menuItemId_idx" ON "AddonGroup"("menuItemId");

-- AddonOption
CREATE TABLE IF NOT EXISTS "AddonOption" (
  "id"           TEXT NOT NULL,
  "addonGroupId" TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "pricePaise"   INTEGER NOT NULL DEFAULT 0,
  "isDefault"    BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "AddonOption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AddonOption_addonGroupId_fkey" FOREIGN KEY ("addonGroupId")
    REFERENCES "AddonGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AddonOption_addonGroupId_idx" ON "AddonOption"("addonGroupId");

-- GiftCard
CREATE TABLE IF NOT EXISTS "GiftCard" (
  "id"                  TEXT NOT NULL,
  "code"                TEXT NOT NULL,
  "originalValuePaise"  INTEGER NOT NULL,
  "remainingValuePaise" INTEGER NOT NULL,
  "purchasedByUserId"   TEXT,
  "redeemedByUserId"    TEXT,
  "expiresAt"           TIMESTAMP(3),
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GiftCard_purchasedByUserId_fkey" FOREIGN KEY ("purchasedByUserId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "GiftCard_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "GiftCard_code_key" ON "GiftCard"("code");
CREATE INDEX IF NOT EXISTS "GiftCard_code_idx" ON "GiftCard"("code");

-- Referral
CREATE TABLE IF NOT EXISTS "Referral" (
  "id"          TEXT NOT NULL,
  "referrerId"  TEXT NOT NULL,
  "refereeId"   TEXT NOT NULL,
  "rewardPaise" INTEGER NOT NULL DEFAULT 5000,
  "rewardedAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_refereeId_key" ON "Referral"("refereeId");
CREATE INDEX IF NOT EXISTS "Referral_referrerId_idx" ON "Referral"("referrerId");

-- SupportTicket
CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "orderId"     TEXT,
  "subject"     TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'OPEN',
  "adminReply"  TEXT,
  "repliedAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupportTicket_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "SupportTicket_userId_status_idx" ON "SupportTicket"("userId", "status");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_createdAt_idx" ON "SupportTicket"("status", "createdAt");

-- ChatMessage
CREATE TABLE IF NOT EXISTS "ChatMessage" (
  "id"         TEXT NOT NULL,
  "orderId"    TEXT NOT NULL,
  "senderId"   TEXT NOT NULL,
  "senderRole" TEXT NOT NULL,
  "message"    TEXT NOT NULL,
  "readAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChatMessage_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ChatMessage_orderId_createdAt_idx" ON "ChatMessage"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");
