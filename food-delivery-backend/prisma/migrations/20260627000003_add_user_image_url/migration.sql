-- Add optional profile photo URL to User (used by rider onboarding)
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
