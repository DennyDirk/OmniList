import { and, desc, eq } from "drizzle-orm";
import type { DbClient } from "../../db/client";
import { channelConnectionsTable as connections } from "../../db/schema";
import type { ChannelConnectionRecord } from "./channel-connections.repository";

export interface EtsySessionRepository {
  authorize(workspaceId: string, refresh: (credentials: Record<string, string>) => Promise<Record<string, string>>): Promise<ChannelConnectionRecord>;
}

export function createEtsySessionRepository(db: DbClient): EtsySessionRepository {
  return {
    async authorize(workspaceId, refresh) {
      try {
        return await db.transaction(async tx => {
          // A bounded token request holds the row lock; other API instances must not rotate the same token.
          const [row] = await tx.select().from(connections).where(and(eq(connections.workspaceId, workspaceId),
            eq(connections.channelId, "etsy"))).orderBy(desc(connections.updatedAt)).limit(1).for("update", { noWait: true });
          if (!row || row.status !== "connected") throw new Error("ETSY_RECONNECT_REQUIRED");
          if (row.credentials.shopId !== row.externalAccountId) throw new Error("ETSY_RECONNECT_REQUIRED");
          const credentials = await refresh(structuredClone(row.credentials));
          if (JSON.stringify(credentials) !== JSON.stringify(row.credentials)) {
            // Credential rotation does not change the seller/settings revision.
            await tx.update(connections).set({ credentials }).where(eq(connections.id, row.id));
          }
          return { connection: { id: row.id, workspaceId: row.workspaceId, channelId: "etsy", status: "connected",
            externalAccountId: row.externalAccountId ?? undefined, metadata: row.metadata }, credentials };
        });
      } catch (error) {
        const pgError = error as { code?: string; cause?: { code?: string } };
        if (pgError.code === "55P03" || pgError.cause?.code === "55P03") throw new Error("ETSY_CONNECTION_BUSY");
        throw error;
      }
    }
  };
}
