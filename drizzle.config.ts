import type { Config } from "drizzle-kit";

export default {
  out: "./drizzle",
  schema: "./apps/api/src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ""
  }
} satisfies Config;
