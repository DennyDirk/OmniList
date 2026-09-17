import { createHash } from "node:crypto";
import type { ChannelConnectionRecord } from "../channels/channel-connections.repository";

// Credentials rotate; seller identity, connection time and settings must not drift after enqueue.
export function connectionRevision(record: ChannelConnectionRecord, environment: string): string {
  const { id, workspaceId, channelId, status, externalAccountId, metadata } = record.connection;
  return createHash("sha256").update(JSON.stringify({ id, workspaceId, channelId, status,
    externalAccountId: externalAccountId ?? "", environment: record.credentials.environment ?? environment,
    metadata: Object.entries(metadata).sort(([a], [b]) => a.localeCompare(b)) })).digest("hex");
}
