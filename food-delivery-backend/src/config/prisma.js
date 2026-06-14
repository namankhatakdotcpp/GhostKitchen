import { PrismaClient } from "@prisma/client";

// Query-level logging is disabled in production:
//  - queries may contain sensitive parameter values (emails, addresses, etc.)
//  - on Render the volume fills the ephemeral disk very quickly under load
// In development the full log helps debug N+1 queries and slow plans.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["query", "error", "warn"],
});
