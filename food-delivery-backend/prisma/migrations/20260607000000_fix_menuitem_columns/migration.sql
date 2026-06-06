-- Safe additive migration: ensure all MenuItem columns exist in production
-- Uses IF NOT EXISTS throughout so it is safe to run multiple times

ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "isVeg"        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "isBestseller" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "sortOrder"    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MenuItem" ADD COLUMN IF NOT EXISTS "isAvailable"  BOOLEAN NOT NULL DEFAULT true;

-- Indexes (idempotent)
CREATE INDEX IF NOT EXISTS "MenuItem_restaurantId_idx"              ON "MenuItem"("restaurantId");
CREATE INDEX IF NOT EXISTS "MenuItem_restaurantId_category_idx"     ON "MenuItem"("restaurantId", "category");
CREATE INDEX IF NOT EXISTS "MenuItem_restaurantId_isAvailable_idx"  ON "MenuItem"("restaurantId", "isAvailable");
