-- Incident escalation + timeline (idempotent).

-- System-raised incidents have no human creator.
ALTER TABLE "Incident" ALTER COLUMN "createdById" DROP NOT NULL;

ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "acknowledgedAt" TIMESTAMP(3);
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "escalatedAt" TIMESTAMP(3);
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "escalationCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Incident" ADD COLUMN IF NOT EXISTS "lastNotifiedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "IncidentEvent" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "IncidentEvent_incidentId_createdAt_idx" ON "IncidentEvent"("incidentId", "createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IncidentEvent_incidentId_fkey') THEN
    ALTER TABLE "IncidentEvent" ADD CONSTRAINT "IncidentEvent_incidentId_fkey"
      FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
