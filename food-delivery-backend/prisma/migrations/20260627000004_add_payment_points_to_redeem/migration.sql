-- Add pointsToRedeem to Payment so loyalty points work for online-payment orders
ALTER TABLE "Payment"
  ADD COLUMN IF NOT EXISTS "pointsToRedeem" INTEGER NOT NULL DEFAULT 0;
