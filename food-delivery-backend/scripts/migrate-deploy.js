/**
 * Self-healing migration deploy for production (Render).
 *
 * Problem this solves: when a `prisma migrate deploy` is interrupted (e.g. a
 * Render build is cancelled mid-migration), the migration is left in a "failed"
 * state in the `_prisma_migrations` table. Every subsequent deploy then aborts
 * with P3009 ("migrate found failed migrations") until someone manually runs
 * `prisma migrate resolve`. We used to hardcode that resolve into the Render
 * build command per-migration, which broke again the moment a *different*
 * migration failed.
 *
 * Every migration in this repo is written to be idempotent (CREATE/ALTER ...
 * IF [NOT] EXISTS, guarded renames), so a failed migration is always safe to
 * re-apply. This script finds any failed migration, marks it rolled-back so
 * Prisma will re-run it, then runs `migrate deploy`.
 *
 * Run as: node scripts/migrate-deploy.js
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

// A migration is "failed" when it was started but never finished and was not
// rolled back. Querying the table directly is version-independent and far more
// reliable than parsing `prisma migrate status` output.
async function findFailedMigrations() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT migration_name FROM "_prisma_migrations"
       WHERE finished_at IS NULL AND rolled_back_at IS NULL
       ORDER BY started_at ASC`
    );
    return rows.map((r) => r.migration_name);
  } catch (err) {
    // The table won't exist on a brand-new database, and the DB may briefly be
    // unreachable. Either way, let `migrate deploy` be the source of truth.
    console.warn(`[migrate-deploy] Could not inspect _prisma_migrations (${err.message}); proceeding to deploy.`);
    return [];
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const failed = await findFailedMigrations();
  if (failed.length > 0) {
    console.warn(`[migrate-deploy] Found ${failed.length} failed migration(s): ${failed.join(", ")}`);
    console.warn("[migrate-deploy] Marking them rolled-back so they re-apply (migrations in this repo are idempotent).");
    for (const name of failed) {
      run(`npx prisma migrate resolve --rolled-back ${name}`);
    }
  } else {
    console.log("[migrate-deploy] No failed migrations detected.");
  }
  run("npx prisma migrate deploy");
}

main().catch((err) => {
  console.error("[migrate-deploy] FATAL:", err);
  process.exit(1);
});
