import {
  channelConnectionUpsertInputSchema,
  channels,
  type ChannelId,
  type ChannelConnection,
  type ChannelConnectionUpsertInput
} from "@omnilist/shared";
import { and, desc, eq } from "drizzle-orm";

import type { DbClient } from "../../db/client";
import { channelConnectionsTable } from "../../db/schema";

export interface ChannelConnectionRecord {
  connection: ChannelConnection;
  credentials: Record<string, string>;
}

export interface ChannelConnectionRepository {
  listConnections(workspaceId: string): Promise<ChannelConnection[]>;
  getConnection(workspaceId: string, channelId: ChannelId): Promise<ChannelConnection | undefined>;
  getConnectionRecord(workspaceId: string, channelId: ChannelId): Promise<ChannelConnectionRecord | undefined>;
  upsertConnection(
    workspaceId: string,
    channelId: ChannelConnection["channelId"],
    input: ChannelConnectionUpsertInput
  ): Promise<ChannelConnection>;
  setCredentials(workspaceId: string, channelId: ChannelId, credentials: Record<string, string>): Promise<void>;
}

function createDefaultConnections(workspaceId: string): ChannelConnection[] {
  return channels.map((channel) => ({
    id: crypto.randomUUID(),
    workspaceId,
    channelId: channel.id,
    status: "disconnected",
    metadata: {}
  }));
}

function fromDbRow(row: typeof channelConnectionsTable.$inferSelect): ChannelConnection {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channelId: row.channelId as ChannelConnection["channelId"],
    status: row.status as ChannelConnection["status"],
    externalAccountId: row.externalAccountId ?? undefined,
    metadata: row.metadata
  };
}

function toConnectionRecord(row: typeof channelConnectionsTable.$inferSelect): ChannelConnectionRecord {
  return {
    connection: fromDbRow(row),
    credentials: row.credentials
  };
}

interface StoredConnectionItem {
  connection: ChannelConnection;
  credentials: Record<string, string>;
}

function getWorkspaceItems(
  store: Map<string, Map<string, StoredConnectionItem>>,
  workspaceId: string
) {
  const existing = store.get(workspaceId);

  if (existing) {
    return existing;
  }

  const created = new Map<string, StoredConnectionItem>(
    createDefaultConnections(workspaceId).map((item) => [item.channelId, { connection: item, credentials: {} }])
  );
  store.set(workspaceId, created);
  return created;
}

function createMemoryChannelConnectionRepository(): ChannelConnectionRepository {
  const itemsByWorkspace = new Map<string, Map<string, StoredConnectionItem>>();

  return {
    async listConnections(workspaceId) {
      return [...getWorkspaceItems(itemsByWorkspace, workspaceId).values()].map((item) => item.connection);
    },
    async getConnection(workspaceId, channelId) {
      return getWorkspaceItems(itemsByWorkspace, workspaceId).get(channelId)?.connection;
    },
    async getConnectionRecord(workspaceId, channelId) {
      return getWorkspaceItems(itemsByWorkspace, workspaceId).get(channelId);
    },
    async upsertConnection(workspaceId, channelId, input) {
      const parsed = channelConnectionUpsertInputSchema.parse(input);
      const items = getWorkspaceItems(itemsByWorkspace, workspaceId);
      const existing = items.get(channelId);
      const nextItem: ChannelConnection = {
        id: existing?.connection.id ?? crypto.randomUUID(),
        workspaceId,
        channelId,
        status: parsed.status,
        externalAccountId: parsed.externalAccountId,
        metadata: parsed.metadata
      };

      items.set(channelId, {
        connection: nextItem,
        credentials: existing?.credentials ?? {}
      });
      return nextItem;
    },
    async setCredentials(workspaceId, channelId, credentials) {
      const items = getWorkspaceItems(itemsByWorkspace, workspaceId);
      const existing = items.get(channelId);

      if (!existing) {
        return;
      }

      items.set(channelId, {
        connection: existing.connection,
        credentials
      });
    }
  };
}

function buildDefaultConnection(workspaceId: string, channelId: ChannelId): ChannelConnection {
  return {
    id: crypto.randomUUID(),
    workspaceId,
    channelId,
    status: "disconnected",
    metadata: {}
  };
}

function dedupeRows(rows: Array<typeof channelConnectionsTable.$inferSelect>) {
  const latestByChannelId = new Map<ChannelId, typeof channelConnectionsTable.$inferSelect>();

  for (const row of rows) {
    const channelId = row.channelId as ChannelId;
    const existing = latestByChannelId.get(channelId);

    if (!existing) {
      latestByChannelId.set(channelId, row);
      continue;
    }

    const existingUpdatedAt = existing.updatedAt?.getTime() ?? 0;
    const rowUpdatedAt = row.updatedAt?.getTime() ?? 0;

    if (rowUpdatedAt >= existingUpdatedAt) {
      latestByChannelId.set(channelId, row);
    }
  }

  return latestByChannelId;
}

async function findLatestDbConnectionRow(db: DbClient, workspaceId: string, channelId: ChannelId) {
  const rows = await db
    .select()
    .from(channelConnectionsTable)
    .where(and(eq(channelConnectionsTable.workspaceId, workspaceId), eq(channelConnectionsTable.channelId, channelId)))
    .orderBy(desc(channelConnectionsTable.updatedAt), desc(channelConnectionsTable.createdAt))
    .limit(1);

  return rows[0];
}

async function ensureDbConnectionRow(db: DbClient, workspaceId: string, channelId: ChannelId) {
  const existing = await findLatestDbConnectionRow(db, workspaceId, channelId);

  if (existing) {
    return existing;
  }

  const defaultConnection = buildDefaultConnection(workspaceId, channelId);
  const inserted = await db
    .insert(channelConnectionsTable)
    .values({
      id: defaultConnection.id,
      workspaceId: defaultConnection.workspaceId,
      channelId: defaultConnection.channelId,
      status: defaultConnection.status,
      externalAccountId: defaultConnection.externalAccountId,
      metadata: defaultConnection.metadata,
      credentials: {}
    })
    .returning();

  return inserted[0];
}

function createDbChannelConnectionRepository(db: DbClient): ChannelConnectionRepository {
  return {
    async listConnections(workspaceId) {
      const rows = await db
        .select()
        .from(channelConnectionsTable)
        .where(eq(channelConnectionsTable.workspaceId, workspaceId));

      const latestByChannelId = dedupeRows(rows);

      return channels.map((channel) => {
        const row = latestByChannelId.get(channel.id);
        return row ? fromDbRow(row) : buildDefaultConnection(workspaceId, channel.id);
      });
    },
    async getConnection(workspaceId, channelId) {
      const row = await ensureDbConnectionRow(db, workspaceId, channelId);
      return fromDbRow(row);
    },
    async getConnectionRecord(workspaceId, channelId) {
      const row = await ensureDbConnectionRow(db, workspaceId, channelId);
      return toConnectionRecord(row);
    },
    async upsertConnection(workspaceId, channelId, input) {
      const parsed = channelConnectionUpsertInputSchema.parse(input);
      const existing = await ensureDbConnectionRow(db, workspaceId, channelId);

      const rows = await db
        .update(channelConnectionsTable)
        .set({
          status: parsed.status,
          externalAccountId: parsed.externalAccountId,
          metadata: parsed.metadata,
          updatedAt: new Date()
        })
        .where(eq(channelConnectionsTable.id, existing.id))
        .returning();

      return fromDbRow(rows[0]);
    },
    async setCredentials(workspaceId, channelId, credentials) {
      const existing = await ensureDbConnectionRow(db, workspaceId, channelId);

      await db
        .update(channelConnectionsTable)
        .set({
          credentials,
          updatedAt: new Date()
        })
        .where(eq(channelConnectionsTable.id, existing.id));
    }
  };
}

export function createChannelConnectionRepository(db?: DbClient): ChannelConnectionRepository {
  if (!db) {
    return createMemoryChannelConnectionRepository();
  }

  return createDbChannelConnectionRepository(db);
}
