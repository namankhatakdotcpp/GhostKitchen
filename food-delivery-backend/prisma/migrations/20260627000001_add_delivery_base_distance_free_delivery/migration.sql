-- AlterTable: add deliveryBaseDistanceKm, update deliveryPerKmFee default, add free delivery fields
ALTER TABLE "PlatformSettings"
  ADD COLUMN IF NOT EXISTS "deliveryBaseDistanceKm" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS "freeDeliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "freeDeliveryMinOrder" INTEGER NOT NULL DEFAULT 0;

-- Update the default for deliveryPerKmFee to ₹10/km (1000 paise) on the singleton row
-- only if it still holds the original default (200), so we don't overwrite admin customisation.
UPDATE "PlatformSettings"
  SET "deliveryPerKmFee" = 1000
WHERE id = 'singleton' AND "deliveryPerKmFee" = 200;
