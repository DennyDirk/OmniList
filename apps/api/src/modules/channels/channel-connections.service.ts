import type { ChannelId, ChannelConnectionUpsertInput } from "@omnilist/shared";

import type { ChannelConnectionRepository } from "./channel-connections.repository";

export function createChannelConnectionsService(repository: ChannelConnectionRepository) {
  function stripOAuthMetadata(metadata: Record<string, string>) {
    return Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !["authMode", "connectedAt", "environment"].includes(key))
    );
  }

  return {
    listConnections(workspaceId: string) {
      return repository.listConnections(workspaceId);
    },
    upsertConnection(workspaceId: string, channelId: ChannelId, input: ChannelConnectionUpsertInput) {
      return repository.upsertConnection(workspaceId, channelId, input);
    },
    async disconnectConnection(workspaceId: string, channelId: ChannelId) {
      const existing = await repository.getConnection(workspaceId, channelId);

      const connection = await repository.upsertConnection(workspaceId, channelId, {
        status: "disconnected",
        externalAccountId: undefined,
        metadata: stripOAuthMetadata(existing?.metadata ?? {})
      });

      await repository.setCredentials(workspaceId, channelId, {});
      return connection;
    }
  };
}
