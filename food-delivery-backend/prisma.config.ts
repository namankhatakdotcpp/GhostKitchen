import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Load environment variables BEFORE any Prisma operations
dotenv.config();

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrate: {
    datasource: "db",
  },

  datasources: {
    db: {
      url: process.env.DATABASE_URL!,
    },
  },
});
