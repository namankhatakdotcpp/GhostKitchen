-- AlterTable: add estimatedDelivery to Order for ETA engine
ALTER TABLE "Order" ADD COLUMN "estimatedDelivery" TIMESTAMP(3);
