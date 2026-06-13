-- Incident Center for admin operations intelligence.
-- Idempotent (IF [NOT] EXISTS / guarded) so a failed deploy can be re-applied
-- by scripts/migrate-deploy.js + scripts/resolve-failed-migrations.js.

DO $$ BEGIN
  CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "Incident" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "category" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Incident_status_idx" ON "Incident"("status");
CREATE INDEX IF NOT EXISTS "Incident_severity_idx" ON "Incident"("severity");
CREATE INDEX IF NOT EXISTS "Incident_createdAt_idx" ON "Incident"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Incident_createdById_fkey') THEN
    ALTER TABLE "Incident" ADD CONSTRAINT "Incident_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Incident_resolvedById_fkey') THEN
    ALTER TABLE "Incident" ADD CONSTRAINT "Incident_resolvedById_fkey"
      FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
