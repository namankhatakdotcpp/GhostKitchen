-- AlterTable: add estimatedDelivery to Order for ETA engine
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "estimatedDelivery" TIMESTAMP(3);
