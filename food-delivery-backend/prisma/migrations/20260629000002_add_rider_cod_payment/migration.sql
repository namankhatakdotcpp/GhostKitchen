CREATE TABLE IF NOT EXISTS "RiderCODPayment" (
  "id"           TEXT NOT NULL,
  "riderId"      TEXT NOT NULL,
  "cfOrderId"    TEXT NOT NULL,
  "cfPaymentId"  TEXT,
  "amountPaise"  INTEGER NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'PENDING',
  "settledCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiderCODPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RiderCODPayment_cfOrderId_key" ON "RiderCODPayment"("cfOrderId");
CREATE INDEX IF NOT EXISTS "RiderCODPayment_riderId_status_idx" ON "RiderCODPayment"("riderId", "status");

ALTER TABLE "RiderCODPayment"
  ADD CONSTRAINT "RiderCODPayment_riderId_fkey"
  FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
