-- CreateTable: RiderLocation — live GPS position per delivery rider (admin live map).
-- Written idempotently (IF [NOT] EXISTS / guarded constraint) so a failed/interrupted
-- deploy can be safely re-applied by scripts/migrate-deploy.js.
CREATE TABLE IF NOT EXISTS "RiderLocation" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "heading" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiderLocation_pkey" PRIMARY KEY ("id")
);

-- One location row per rider.
CREATE UNIQUE INDEX IF NOT EXISTS "RiderLocation_riderId_key" ON "RiderLocation"("riderId");

-- Spatial-ish lookup index for map bounding-box queries.
CREATE INDEX IF NOT EXISTS "RiderLocation_latitude_longitude_idx" ON "RiderLocation"("latitude", "longitude");

-- Foreign key to the rider (cascade so a deleted user drops their location).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RiderLocation_riderId_fkey') THEN
    ALTER TABLE "RiderLocation" ADD CONSTRAINT "RiderLocation_riderId_fkey"
      FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
