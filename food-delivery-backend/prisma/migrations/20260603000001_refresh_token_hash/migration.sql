-- AlterTable: rename token -> tokenHash in RefreshToken
-- This stores a SHA-256 hash of the refresh token, not the raw value.
-- If the DB is ever breached, raw tokens cannot be replayed.

ALTER TABLE "RefreshToken" RENAME COLUMN "token" TO "tokenHash";
