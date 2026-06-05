-- Safe additive migration for production DB schema gaps
-- Uses IF NOT EXISTS throughout to be idempotent

-- ── Restaurant: add columns missing from old schema ───────────────────────────
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "isOpen" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "deliveryRadius" DOUBLE PRECISION NOT NULL DEFAULT 5;

-- ── Restaurant: unique index on slug (idempotent) ────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS "Restaurant_slug_key" ON "Restaurant"("slug");

-- ── User: add multi-role columns if missing ───────────────────────────────────
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "activeRole" TEXT NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "secondRole" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vehicleType" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vehicleNumber" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isOnDuty" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isAvailable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentLat" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentLng" DOUBLE PRECISION;

-- ── Order: add columns if missing ────────────────────────────────────────────
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "discount" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "total" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryAddress" JSONB;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cfOrderId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);

-- ── AuditLog: create if missing ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "meta" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- ── Indexes (all IF NOT EXISTS, only on columns we just ensured exist) ────────
CREATE INDEX IF NOT EXISTS "Restaurant_slug_idx" ON "Restaurant"("slug");
CREATE INDEX IF NOT EXISTS "Restaurant_isOpen_idx" ON "Restaurant"("isOpen");
CREATE INDEX IF NOT EXISTS "Restaurant_rating_idx" ON "Restaurant"("rating");
CREATE INDEX IF NOT EXISTS "User_activeRole_idx" ON "User"("activeRole");
CREATE INDEX IF NOT EXISTS "User_isAvailable_idx" ON "User"("isAvailable");
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
