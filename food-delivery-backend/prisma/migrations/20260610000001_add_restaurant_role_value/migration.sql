-- AlterEnum
-- This migration adds RESTAURANT to the Role enum.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block,
-- so Prisma must run it outside one.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'RESTAURANT';
