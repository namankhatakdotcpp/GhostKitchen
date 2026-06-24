-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "adminRevenue" DOUBLE PRECISION,
ADD COLUMN     "distanceKm" DOUBLE PRECISION,
ADD COLUMN     "gstOnDeliveryFee" DOUBLE PRECISION,
ADD COLUMN     "gstOnItemTotal" DOUBLE PRECISION,
ADD COLUMN     "gstOnPlatformFee" DOUBLE PRECISION,
ADD COLUMN     "itemTotal" DOUBLE PRECISION,
ADD COLUMN     "platformFee" DOUBLE PRECISION,
ADD COLUMN     "pricingSnapshot" JSONB,
ADD COLUMN     "restaurantPackaging" DOUBLE PRECISION,
ADD COLUMN     "restaurantPayout" DOUBLE PRECISION,
ADD COLUMN     "riderPayout" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "deliveryBaseFee" INTEGER NOT NULL DEFAULT 1000,
    "deliveryPerKmFee" INTEGER NOT NULL DEFAULT 200,
    "platformFeeMode" TEXT NOT NULL DEFAULT 'FLAT',
    "platformFeeValue" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "splitRestaurantPct" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "splitRiderPct" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "splitAdminPct" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

