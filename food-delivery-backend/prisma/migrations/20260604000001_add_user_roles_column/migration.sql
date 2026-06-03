-- Add roles array column if missing (old schema had single "role" field)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "roles" "Role"[] DEFAULT ARRAY['CUSTOMER']::"Role"[];

-- Backfill roles from existing role/activeRole if needed
UPDATE "User" SET "roles" = ARRAY["activeRole"::"Role"] WHERE "roles" = '{}' OR "roles" IS NULL;
