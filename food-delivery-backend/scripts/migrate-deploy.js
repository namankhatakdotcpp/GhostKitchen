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

// Neon's free tier auto-suspends when idle; cold-start wake-up can take
// longer than Prisma's advisory-lock timeout, producing P1002. Retried below.
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

// Gives the migrate-deploy subprocess more time to acquire the advisory lock
// during a Neon cold start. Built fresh from the real env var on every call
// and passed only to that subprocess's env — process.env.DATABASE_URL (used
// by the running app and by findFailedMigrations() below) is never mutated.
function withConnectTimeout(databaseUrl) {
  if (!databaseUrl) return databaseUrl;
  if (/connect_timeout=/.test(databaseUrl)) return databaseUrl;
  const separator = databaseUrl.includes("?") ? "&" : "?";
  return `${databaseUrl}${separator}connect_timeout=30`;
}

// Runs `prisma migrate deploy`, retrying on P1002 (advisory lock timeout)
// since that error means Neon was still waking up, not a real migration
// failure. Output is captured (not inherited) so we can inspect it for
// P1002 — then echoed so build logs look the same as before.
function runMigrateDeploy(attempt = 1) {
  console.log(`\n$ npx prisma migrate deploy (attempt ${attempt}/${MAX_RETRIES})`);
  const env = {
    ...process.env,
    ...(process.env.DATABASE_URL
      ? { DATABASE_URL: withConnectTimeout(process.env.DATABASE_URL) }
      : {}),
  };

  try {
    const output = execSync("npx prisma migrate deploy", { encoding: "utf8", env });
    process.stdout.write(output);
    console.log("[migrate-deploy] Migrations applied successfully.");
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    process.stdout.write(output);

    const isTimeoutError = output.includes("P1002") || error.message?.includes("P1002");
    if (isTimeoutError && attempt < MAX_RETRIES) {
      console.warn(
        `[migrate-deploy] Database cold-start timeout (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${RETRY_DELAY_MS / 1000}s...`
      );
      execSync(`sleep ${RETRY_DELAY_MS / 1000}`);
      return runMigrateDeploy(attempt + 1);
    }

    console.error("[migrate-deploy] FATAL:", error.message);
    process.exit(1);
  }
}

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
  runMigrateDeploy();
}

main().catch((err) => {
  console.error("[migrate-deploy] FATAL:", err);
  process.exit(1);
});
