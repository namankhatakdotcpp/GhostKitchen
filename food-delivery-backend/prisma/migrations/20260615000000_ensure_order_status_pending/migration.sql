-- Ensures the OrderStatus enum in production has the PENDING value.
-- Safe to run on any DB: "IF NOT EXISTS" makes this idempotent.
-- Background: the production DB may have been created from an older schema
-- that did not include PENDING in OrderStatus, causing a Postgres enum error
-- in the ops/incident engine when querying Order.status IN ('PENDING', ...).
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PENDING' AFTER 'PLACED';
