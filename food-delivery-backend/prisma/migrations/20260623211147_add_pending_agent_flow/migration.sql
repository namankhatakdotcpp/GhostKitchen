-- Two-step accept/reject flow for delivery assignment.
-- agentId now means "rider has ACCEPTED and is confirmed" — it used to be
-- written unilaterally by assignDeliveryAgent the moment it ran, with no
-- "offer sent, awaiting response" state. pendingAgentId/agentOfferedAt hold
-- that interim state until the offered rider actually accepts or rejects.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pendingAgentId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "agentOfferedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_pendingAgentId_idx" ON "Order"("pendingAgentId");
