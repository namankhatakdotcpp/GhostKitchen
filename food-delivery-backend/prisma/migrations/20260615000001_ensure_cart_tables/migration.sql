-- Rescue migration: create CartItem if it was never applied to the production DB.
-- The baseline migration (20260603000000) contains CartItem, but production may have
-- had it marked as applied before the CartItem table was added to the baseline SQL.
-- All statements are idempotent — safe to run on any DB state.

CREATE TABLE IF NOT EXISTS "CartItem" (
    "id"         TEXT         NOT NULL,
    "userId"     TEXT         NOT NULL,
    "menuItemId" TEXT         NOT NULL,
    "quantity"   INTEGER      NOT NULL DEFAULT 1,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_userId_menuItemId_key"
    ON "CartItem"("userId", "menuItemId");

CREATE INDEX IF NOT EXISTS "CartItem_userId_idx"
    ON "CartItem"("userId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CartItem_userId_fkey'
  ) THEN
    ALTER TABLE "CartItem"
      ADD CONSTRAINT "CartItem_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CartItem_menuItemId_fkey'
  ) THEN
    ALTER TABLE "CartItem"
      ADD CONSTRAINT "CartItem_menuItemId_fkey"
      FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
