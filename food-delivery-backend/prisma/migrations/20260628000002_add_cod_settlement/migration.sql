-- CODSettlement table: one row per delivered COD order.
-- Tracks rider's cash due to platform and platform's payable to restaurant.

CREATE TABLE "CODSettlement" (
    "id"                TEXT NOT NULL,
    "orderId"           TEXT NOT NULL,
    "riderId"           TEXT NOT NULL,
    "restaurantId"      TEXT NOT NULL,
    "customerTotal"     INTEGER NOT NULL,
    "riderPayout"       INTEGER NOT NULL,
    "riderCODDue"       INTEGER NOT NULL,
    "restaurantPayable" INTEGER NOT NULL,
    "adminNet"          INTEGER NOT NULL,
    "gstCollected"      INTEGER NOT NULL,
    "riderSettledAt"    TIMESTAMP(3),
    "riderSettledBy"    TEXT,
    "restaurantPaidAt"  TIMESTAMP(3),
    "restaurantPaidBy"  TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CODSettlement_pkey" PRIMARY KEY ("id")
);

-- Unique: one settlement per order
CREATE UNIQUE INDEX "CODSettlement_orderId_key" ON "CODSettlement"("orderId");

-- Indexes for admin queries
CREATE INDEX "CODSettlement_riderId_riderSettledAt_idx"         ON "CODSettlement"("riderId", "riderSettledAt");
CREATE INDEX "CODSettlement_restaurantId_restaurantPaidAt_idx"   ON "CODSettlement"("restaurantId", "restaurantPaidAt");
CREATE INDEX "CODSettlement_createdAt_idx"                       ON "CODSettlement"("createdAt");

-- Foreign keys
ALTER TABLE "CODSettlement" ADD CONSTRAINT "CODSettlement_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CODSettlement" ADD CONSTRAINT "CODSettlement_riderId_fkey"
    FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CODSettlement" ADD CONSTRAINT "CODSettlement_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
