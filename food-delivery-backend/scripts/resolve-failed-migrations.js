/**
 * Resolve-only self-heal, run from `postinstall`.
 *
 * When a `prisma migrate deploy` is interrupted, the migration is left in a
 * "failed" state and every later deploy aborts with P3009. The Render build
 * command runs `migrate deploy` directly, so it stays wedged until the failed
 * migration is resolved. This script — which runs during `npm install`, before
 * that `migrate deploy` — finds any failed migration and marks it rolled-back
 * so Prisma re-applies it (all migrations in this repo are idempotent).
 *
 * It is deliberately defensive: it NEVER throws and ALWAYS exits 0, so it can
 * run safely during local installs and CI (where the DB is absent or a
 * placeholder) without ever breaking `npm install`. When there is nothing to
 * fix — the normal steady state — it is a single cheap query and a no-op.
 */
import { execSync } from "node:child_process";

async function main() {
  let prisma;
  try {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  } catch {
    // Client not generated yet — nothing we can do here; deploy step handles it.
    return;
  }

  let failed = [];
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT migration_name FROM "_prisma_migrations"
       WHERE finished_at IS NULL AND rolled_back_at IS NULL
       ORDER BY started_at ASC`,
    );
    failed = rows.map((r) => r.migration_name);
  } catch {
    // No DATABASE_URL, unreachable DB, or table missing (fresh DB / CI).
    // Let `prisma migrate deploy` be the source of truth.
    return;
  } finally {
    try { await prisma.$disconnect(); } catch { /* ignore */ }
  }

  for (const name of failed) {
    try {
      console.warn(`[resolve-failed-migrations] Marking failed migration rolled-back: ${name}`);
      execSync(`npx prisma migrate resolve --rolled-back ${name}`, { stdio: "inherit" });
    } catch {
      // Don't let a single resolve failure break the install/build.
    }
  }
}

main()
  .catch(() => { /* never throw from postinstall */ })
  .finally(() => process.exit(0));
