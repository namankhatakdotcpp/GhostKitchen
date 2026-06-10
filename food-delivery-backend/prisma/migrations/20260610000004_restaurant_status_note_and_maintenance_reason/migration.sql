-- Add statusNote to Restaurant for granular open/close messaging
ALTER TABLE "Restaurant" ADD COLUMN "statusNote" TEXT;

-- Add maintenanceReason to SiteConfig
ALTER TABLE "SiteConfig" ADD COLUMN "maintenanceReason" TEXT;
