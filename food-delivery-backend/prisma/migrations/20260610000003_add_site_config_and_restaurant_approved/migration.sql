-- CreateTable SiteConfig
CREATE TABLE "SiteConfig" (
    "id"                 TEXT NOT NULL DEFAULT 'singleton',
    "maintenanceMode"    BOOLEAN NOT NULL DEFAULT false,
    "newRestaurantReg"   BOOLEAN NOT NULL DEFAULT true,
    "riderRegistrations" BOOLEAN NOT NULL DEFAULT true,
    "cashOnDelivery"     BOOLEAN NOT NULL DEFAULT true,
    "codMinOrder"        INTEGER NOT NULL DEFAULT 0,
    "maxDeliveryRadius"  INTEGER NOT NULL DEFAULT 20,
    "defaultDeliveryFee" INTEGER NOT NULL DEFAULT 3000,
    "requireApproval"    BOOLEAN NOT NULL DEFAULT false,
    "allowBranches"      BOOLEAN NOT NULL DEFAULT true,
    "maxMenuItems"       INTEGER NOT NULL DEFAULT 200,
    "requireEmailVerify" BOOLEAN NOT NULL DEFAULT false,
    "autoConfirmOrders"  BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT NOW(),
    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton row so it always exists
INSERT INTO "SiteConfig" ("id", "updatedAt") VALUES ('singleton', NOW())
ON CONFLICT ("id") DO NOTHING;

-- Add isApproved to Restaurant (default true so existing restaurants stay live)
ALTER TABLE "Restaurant" ADD COLUMN "isApproved" BOOLEAN NOT NULL DEFAULT true;
