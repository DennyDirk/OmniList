import { config } from "dotenv";
import type { Config } from "drizzle-kit";

config({
  path: "../../.env"
});

export default {
  out: "../../drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? ""
  }
} satisfies Config;
