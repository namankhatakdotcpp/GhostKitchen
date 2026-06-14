-- Wave B: Order lifecycle timestamps + RiderSession activity tracking.
-- All Order columns are nullable so existing rows are unaffected.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "acceptedAt"  TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "readyAt"     TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pickedUpAt"  TIMESTAMP(3);

-- Rider duty sessions (check-in / check-out) for accurate active-hours scoring.
CREATE TABLE IF NOT EXISTS "RiderSession" (
    "id"          TEXT NOT NULL,
    "riderId"     TEXT NOT NULL,
    "startedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"     TIMESTAMP(3),
    "durationMin" DOUBLE PRECISION,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RiderSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "RiderSession_riderId_startedAt_idx"
    ON "RiderSession"("riderId", "startedAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RiderSession_riderId_fkey'
  ) THEN
    ALTER TABLE "RiderSession"
      ADD CONSTRAINT "RiderSession_riderId_fkey"
      FOREIGN KEY ("riderId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
