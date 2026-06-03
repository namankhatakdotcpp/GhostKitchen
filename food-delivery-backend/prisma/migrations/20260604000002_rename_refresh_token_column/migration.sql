-- Rename token -> tokenHash if the old column name still exists
-- Safe: does nothing if already renamed
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'RefreshToken' AND column_name = 'token'
  ) THEN
    ALTER TABLE "RefreshToken" RENAME COLUMN "token" TO "tokenHash";
  END IF;
END $$;

-- Also ensure the unique index exists on tokenHash
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'RefreshToken_tokenHash_key'
  ) THEN
    ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_tokenHash_key" UNIQUE ("tokenHash");
  END IF;
END $$;
