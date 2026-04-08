import type { ChannelId, ChannelConnectionUpsertInput } from "@omnilist/shared";

import type { ChannelConnectionRepository } from "./channel-connections.repository";

export function createChannelConnectionsService(repository: ChannelConnectionRepository) {
  return {
    listConnections(workspaceId: string) {
      return repository.listConnections(workspaceId);
    },
    upsertConnection(workspaceId: string, channelId: ChannelId, input: ChannelConnectionUpsertInput) {
      return repository.upsertConnection(workspaceId, channelId, input);
    }
  };
}
