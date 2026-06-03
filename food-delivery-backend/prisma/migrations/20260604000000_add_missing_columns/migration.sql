-- Add columns that may be missing from production DB (safe with IF NOT EXISTS)

ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "lat" DOUBLE PRECISION;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "lng" DOUBLE PRECISION;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "isOpen" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "deliveryRadius" DOUBLE PRECISION NOT NULL DEFAULT 5;

-- Add unique constraint on slug if not already present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Restaurant_slug_key'
  ) THEN
    ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_slug_key" UNIQUE ("slug");
  END IF;
END $$;

-- Add indexes if not already present
CREATE INDEX IF NOT EXISTS "Restaurant_slug_idx" ON "Restaurant"("slug");
CREATE INDEX IF NOT EXISTS "Restaurant_isOpen_idx" ON "Restaurant"("isOpen");
CREATE INDEX IF NOT EXISTS "Restaurant_rating_idx" ON "Restaurant"("rating");

-- Other potentially missing indexes
CREATE INDEX IF NOT EXISTS "MenuItem_restaurantId_idx" ON "MenuItem"("restaurantId");
CREATE INDEX IF NOT EXISTS "MenuItem_restaurantId_isAvailable_idx" ON "MenuItem"("restaurantId", "isAvailable");
CREATE INDEX IF NOT EXISTS "Order_customerId_idx" ON "Order"("customerId");
CREATE INDEX IF NOT EXISTS "Order_restaurantId_idx" ON "Order"("restaurantId");
CREATE INDEX IF NOT EXISTS "Order_agentId_idx" ON "Order"("agentId");
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "Order_customerId_status_idx" ON "Order"("customerId", "status");
CREATE INDEX IF NOT EXISTS "Order_restaurantId_status_idx" ON "Order"("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "Payment_customerId_idx" ON "Payment"("customerId");
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");
CREATE INDEX IF NOT EXISTS "User_activeRole_idx" ON "User"("activeRole");
CREATE INDEX IF NOT EXISTS "User_isAvailable_idx" ON "User"("isAvailable");

-- Create AuditLog table if not exists
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

CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
