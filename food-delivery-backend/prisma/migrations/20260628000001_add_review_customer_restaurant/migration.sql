-- Add customerId and restaurantId to Review table.
-- Production already has these columns (schema drift); this migration brings
-- the local schema in sync so Prisma generates the correct INSERT statements.

ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "customerId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "restaurantId" TEXT NOT NULL DEFAULT '';

-- Remove the placeholder defaults now that existing rows are patched
ALTER TABLE "Review" ALTER COLUMN "customerId" DROP DEFAULT;
ALTER TABLE "Review" ALTER COLUMN "restaurantId" DROP DEFAULT;

-- Foreign key constraints (skip if already present in production)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Review_customerId_fkey'
  ) THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Review_restaurantId_fkey'
  ) THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "Review_customerId_idx" ON "Review"("customerId");
CREATE INDEX IF NOT EXISTS "Review_restaurantId_idx" ON "Review"("restaurantId");
