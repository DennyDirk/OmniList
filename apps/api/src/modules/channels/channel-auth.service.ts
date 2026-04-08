import type { ChannelConnectionCapability, ChannelId } from "@omnilist/shared";

import type { ChannelConnectionRepository } from "./channel-connections.repository";
import { createChannelAuthRegistry } from "./adapters/channel-auth-registry";
import type { ApiEnv } from "../../config/env";

export const CHANNEL_CONNECT_STATE_COOKIE_NAME = "omnilist-channel-connect-state";

interface ChannelConnectState {
  workspaceId: string;
  channelId: ChannelId;
  state: string;
}

function encodeConnectState(value: ChannelConnectState) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeConnectState(value?: string): ChannelConnectState | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ChannelConnectState;
  } catch {
    return undefined;
  }
}

export function createChannelAuthService(repository: ChannelConnectionRepository, env: ApiEnv) {
  const registry = createChannelAuthRegistry(env);

  return {
    listCapabilities(): ChannelConnectionCapability[] {
      return registry.listCapabilities();
    },
    beginConnection(workspaceId: string, channelId: ChannelId) {
      const adapter = registry.getAdapter(channelId);

      if (!adapter || !adapter.isConfigured()) {
        throw new Error("CHANNEL_CONNECTOR_NOT_CONFIGURED");
      }

      const state = crypto.randomUUID();

      return {
        authorizationUrl: adapter.beginConnection(state),
        stateCookieValue: encodeConnectState({
          workspaceId,
          channelId,
          state
        })
      };
    },
    async completeConnection(input: {
      workspaceId: string;
      channelId: ChannelId;
      code: string;
      returnedState: string;
      stateCookieValue?: string;
    }) {
      const decodedState = decodeConnectState(input.stateCookieValue);

      if (
        !decodedState ||
        decodedState.workspaceId !== input.workspaceId ||
        decodedState.channelId !== input.channelId ||
        decodedState.state !== input.returnedState
      ) {
        throw new Error("INVALID_CHANNEL_CONNECT_STATE");
      }

      const adapter = registry.getAdapter(input.channelId);

      if (!adapter || !adapter.isConfigured()) {
        throw new Error("CHANNEL_CONNECTOR_NOT_CONFIGURED");
      }

      const existing = await repository.getConnection(input.workspaceId, input.channelId);
      const completed = await adapter.completeConnection(input.code);

      const connection = await repository.upsertConnection(input.workspaceId, input.channelId, {
        status: "connected",
        externalAccountId: completed.externalAccountId,
        metadata: {
          ...(existing?.metadata ?? {}),
          ...completed.publicMetadata
        }
      });

      await repository.setCredentials(input.workspaceId, input.channelId, completed.credentials);
      return connection;
    }
  };
}
