import type { DbClient } from "./client";

// Migrations will own structural initialization. Runtime bootstrap stays light.
export async function bootstrapDatabase(_db: DbClient) {
  return;
}
