-- Adds city + radius fields for delivery-agent matching.
--
-- User.city / User.maxRadiusKm: rider onboarding already collects a city
-- string (app/onboarding/rider/page.tsx) but the backend silently dropped it
-- since this column didn't exist. maxRadiusKm defaults to 20 (matches the
-- previous hardcoded fallback in assignDeliveryAgent).
--
-- Restaurant.city: a scalar mirror of the existing address.city JSON key.
-- Needed because Prisma can't run `distinct` on a JSON field (required for
-- GET /api/restaurants/cities) and city-based rider matching needs an
-- indexable column. Backfilled from the existing address JSON below so
-- restaurants created before this migration aren't left unmatched.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "maxRadiusKm" INTEGER NOT NULL DEFAULT 20;

ALTER TABLE "Restaurant" ADD COLUMN IF NOT EXISTS "city" TEXT;
CREATE INDEX IF NOT EXISTS "Restaurant_city_idx" ON "Restaurant"("city");

-- Backfill from the existing address.city JSON key so existing restaurants
-- aren't invisible to city-based matching/filtering until manually re-saved.
UPDATE "Restaurant"
SET "city" = address->>'city'
WHERE "city" IS NULL AND address->>'city' IS NOT NULL;
