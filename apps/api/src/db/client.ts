import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema";

const { Pool } = pg;

function getPoolConfig(databaseUrl: string): pg.PoolConfig {
  try {
    const parsedUrl = new URL(databaseUrl);
    const requiresSsl =
      parsedUrl.hostname.endsWith(".supabase.co") ||
      parsedUrl.hostname.endsWith(".supabase.com") ||
      parsedUrl.searchParams.get("sslmode") === "require";

    return {
      connectionString: databaseUrl,
      ssl: requiresSsl ? { rejectUnauthorized: false } : undefined
    };
  } catch {
    return {
      connectionString: databaseUrl
    };
  }
}

export function createDbClient(databaseUrl: string) {
  const pool = new Pool(getPoolConfig(databaseUrl));

  return drizzle({
    client: pool,
    schema
  });
}

export type DbClient = ReturnType<typeof createDbClient>;
