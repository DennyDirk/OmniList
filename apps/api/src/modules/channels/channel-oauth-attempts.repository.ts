import type { ChannelConnection, ChannelId } from "@omnilist/shared";
import { and, eq, gt, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { DbClient } from "../../db/client";
import { channelConnectionsTable as connections, channelOAuthAttemptsTable as attempts } from "../../db/schema";
import type { ChannelOAuthCompletionResult } from "./adapters/channel-oauth.contract";

export interface OAuthAttemptInput {
  id: string; workspaceId: string; channelId: ChannelId; connectionId: string;
  browserHash: string; verifier: string; expiresAt: Date;
}
export interface ChannelOAuthAttemptRepository {
  start(input: OAuthAttemptInput): Promise<void>;
  claim(id: string, browserHash: string, channelId: ChannelId): Promise<{ verifier: string } | undefined>;
  finish(id: string, result: ChannelOAuthCompletionResult): Promise<ChannelConnection>;
  disconnect(workspaceId: string, channelId: ChannelId): Promise<ChannelConnection | undefined>;
}

function publicConnection(row: typeof connections.$inferSelect): ChannelConnection {
  return { id: row.id, workspaceId: row.workspaceId, channelId: row.channelId as ChannelId,
    status: row.status as ChannelConnection["status"], externalAccountId: row.externalAccountId ?? undefined, metadata: row.metadata };
}

export function createChannelOAuthAttemptRepository(db: DbClient): ChannelOAuthAttemptRepository {
  return {
    async start(input) {
      await db.transaction(async tx => {
        await tx.delete(attempts).where(lte(attempts.expiresAt, new Date()));
        const [connection] = await tx.select({ version: sql<string>`extract(epoch from ${connections.updatedAt})::text` })
          .from(connections).where(and(eq(connections.id, input.connectionId),
            eq(connections.workspaceId, input.workspaceId), eq(connections.channelId, input.channelId)));
        if (!connection) throw new Error("INVALID_CHANNEL_CONNECT_STATE");
        const value = { ...input, connectionVersion: connection.version, claimedAt: null };
        // Starting again invalidates the previous attempt, including one exchanging a code.
        await tx.insert(attempts).values(value).onConflictDoUpdate({
          target: [attempts.workspaceId, attempts.channelId], set: value
        });
      });
    },
    async claim(id, browserHash, channelId) {
      const [row] = await db.update(attempts).set({ claimedAt: new Date() }).where(and(
        eq(attempts.id, id), eq(attempts.browserHash, browserHash), eq(attempts.channelId, channelId),
        isNull(attempts.claimedAt), gt(attempts.expiresAt, new Date())
      )).returning({ verifier: attempts.verifier });
      return row;
    },
    async finish(id, result) {
      return db.transaction(async tx => {
        const [attempt] = await tx.delete(attempts).where(and(eq(attempts.id, id),
          isNotNull(attempts.claimedAt), gt(attempts.expiresAt, new Date()))).returning();
        if (!attempt) throw new Error("INVALID_CHANNEL_CONNECT_STATE");
        // Tokens and connected status commit together; a disconnect or newer settings win.
        const [row] = await tx.update(connections).set({
          status: "connected", externalAccountId: result.externalAccountId,
          metadata: result.publicMetadata, credentials: result.credentials, updatedAt: sql`clock_timestamp()`
        }).where(and(eq(connections.id, attempt.connectionId),
          eq(connections.workspaceId, attempt.workspaceId), eq(connections.channelId, attempt.channelId),
          sql`extract(epoch from ${connections.updatedAt})::text = ${attempt.connectionVersion}`)).returning();
        if (!row) throw new Error("INVALID_CHANNEL_CONNECT_STATE");
        return publicConnection(row);
      });
    },
    async disconnect(workspaceId, channelId) {
      return db.transaction(async tx => {
        await tx.delete(attempts).where(and(eq(attempts.workspaceId, workspaceId), eq(attempts.channelId, channelId)));
        const [row] = await tx.update(connections).set({ status: "disconnected", externalAccountId: null,
          metadata: {}, credentials: {}, updatedAt: sql`clock_timestamp()` }).where(and(
          eq(connections.workspaceId, workspaceId), eq(connections.channelId, channelId))).returning();
        return row ? publicConnection(row) : undefined;
      });
    }
  };
}
