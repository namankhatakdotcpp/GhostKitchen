-- Scheduled maintenance window fields
ALTER TABLE "SiteConfig" ADD COLUMN "maintenanceScheduledAt" TIMESTAMP(3);
ALTER TABLE "SiteConfig" ADD COLUMN "maintenanceEndsAt" TIMESTAMP(3);
