import type { ChannelConnectionCapability, ChannelId } from "@omnilist/shared";
import { createHmac, timingSafeEqual } from "node:crypto";

import type { ChannelConnectionRepository } from "./channel-connections.repository";
import { createChannelAuthRegistry } from "./adapters/channel-auth-registry";
import type { ApiEnv } from "../../config/env";

export const CHANNEL_CONNECT_STATE_COOKIE_NAME = "omnilist-channel-connect-state";

interface ChannelConnectState {
  workspaceId: string;
  channelId: ChannelId;
  state: string;
}

interface SignedChannelConnectState {
  workspaceId: string;
  channelId: ChannelId;
  nonce: string;
  expiresAt: number;
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

function getChannelConnectSecret(env: ApiEnv) {
  return process.env.OMNILIST_APP_SECRET ?? env.ebayClientSecret ?? "omnilist-dev-channel-connect-secret";
}

function signConnectState(secret: string, value: SignedChannelConnectState) {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyConnectState(secret: string, token?: string): SignedChannelConnectState | undefined {
  if (!token) {
    return undefined;
  }

  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return undefined;
  }

  const expectedSignature = createHmac("sha256", secret).update(payload).digest("base64url");

  try {
    if (
      !timingSafeEqual(Buffer.from(signature, "utf8"), Buffer.from(expectedSignature, "utf8"))
    ) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SignedChannelConnectState;

    if (
      typeof parsed.workspaceId !== "string" ||
      (parsed.channelId !== "shopify" && parsed.channelId !== "ebay" && parsed.channelId !== "etsy") ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return undefined;
    }

    if (parsed.expiresAt <= Date.now()) {
      return undefined;
    }

    return parsed;
  } catch {
    return undefined;
  }
}

export function createChannelAuthService(repository: ChannelConnectionRepository, env: ApiEnv) {
  const registry = createChannelAuthRegistry(env);
  const secret = getChannelConnectSecret(env);

  return {
    listCapabilities(): ChannelConnectionCapability[] {
      return registry.listCapabilities();
    },
    beginConnection(workspaceId: string, channelId: ChannelId) {
      const adapter = registry.getAdapter(channelId);

      if (!adapter || !adapter.isConfigured()) {
        throw new Error("CHANNEL_CONNECTOR_NOT_CONFIGURED");
      }

      const nonce = crypto.randomUUID();
      const signedState = signConnectState(secret, {
        workspaceId,
        channelId,
        nonce,
        expiresAt: Date.now() + 10 * 60_000
      });

      return {
        authorizationUrl: adapter.beginConnection(signedState),
        stateCookieValue: encodeConnectState({
          workspaceId,
          channelId,
          state: signedState
        })
      };
    },
    async completeConnection(input: {
      channelId: ChannelId;
      code: string;
      returnedState: string;
      stateCookieValue?: string;
    }) {
      const verifiedState = verifyConnectState(secret, input.returnedState);
      const decodedState = decodeConnectState(input.stateCookieValue);
      const workspaceId = verifiedState?.workspaceId ?? decodedState?.workspaceId;
      const effectiveChannelId = verifiedState?.channelId ?? decodedState?.channelId;
      const stateMatchesCookie = decodedState?.state === input.returnedState;

      if (
        !workspaceId ||
        effectiveChannelId !== input.channelId ||
        (!verifiedState && !stateMatchesCookie)
      ) {
        throw new Error("INVALID_CHANNEL_CONNECT_STATE");
      }

      const adapter = registry.getAdapter(input.channelId);

      if (!adapter || !adapter.isConfigured()) {
        throw new Error("CHANNEL_CONNECTOR_NOT_CONFIGURED");
      }

      const existing = await repository.getConnection(workspaceId, input.channelId);
      const completed = await adapter.completeConnection(input.code);

      const connection = await repository.upsertConnection(workspaceId, input.channelId, {
        status: "connected",
        externalAccountId: completed.externalAccountId,
        metadata: {
          ...(existing?.metadata ?? {}),
          ...completed.publicMetadata
        }
      });

      await repository.setCredentials(workspaceId, input.channelId, completed.credentials);
      return connection;
    }
  };
}
