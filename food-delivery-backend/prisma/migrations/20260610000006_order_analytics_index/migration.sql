-- Composite index for analytics queries: WHERE restaurantId = X AND createdAt >= Y
CREATE INDEX "Order_restaurantId_createdAt_idx" ON "Order"("restaurantId", "createdAt");
