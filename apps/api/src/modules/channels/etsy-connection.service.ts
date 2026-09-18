import { createHash, randomBytes } from "node:crypto";
import type { ApiEnv } from "../../config/env";
import { createEtsyOAuthAdapter } from "./adapters/etsy-oauth.adapter";
import type { ChannelConnectionRepository } from "./channel-connections.repository";
import type { ChannelOAuthAttemptRepository } from "./channel-oauth-attempts.repository";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function createEtsyConnectionService(
  connections: ChannelConnectionRepository, env: ApiEnv,
  attempts?: ChannelOAuthAttemptRepository, fetcher: typeof fetch = fetch
) {
  const adapter = createEtsyOAuthAdapter(env, fetcher);
  return {
    isConfigured: () => Boolean(adapter && attempts),
    async beginConnection(workspaceId: string) {
      if (!adapter || !attempts) throw new Error("CHANNEL_CONNECTOR_NOT_CONFIGURED");
      const connection = await connections.getConnection(workspaceId, "etsy");
      if (!connection) throw new Error("CHANNEL_CONNECTOR_NOT_CONFIGURED");
      const state = randomBytes(32).toString("base64url");
      const browserSecret = randomBytes(32).toString("base64url");
      const verifier = randomBytes(32).toString("base64url");
      await attempts.start({ id: hash(state), workspaceId, channelId: "etsy", connectionId: connection.id,
        browserHash: hash(browserSecret), verifier, expiresAt: new Date(Date.now() + 10 * 60_000) });
      return { authorizationUrl: adapter.beginConnection(state, verifier), stateCookieValue: browserSecret };
    },
    async completeConnection(input: { code?: string; error?: string; returnedState: string; stateCookieValue?: string }) {
      if (!adapter || !attempts) throw new Error("CHANNEL_CONNECTOR_NOT_CONFIGURED");
      if (!/^[\w-]{43}$/.test(input.returnedState) || !input.stateCookieValue || !/^[\w-]{43}$/.test(input.stateCookieValue)) {
        throw new Error("INVALID_CHANNEL_CONNECT_STATE");
      }
      const id = hash(input.returnedState);
      const attempt = await attempts.claim(id, hash(input.stateCookieValue), "etsy");
      if (!attempt) throw new Error("INVALID_CHANNEL_CONNECT_STATE");
      if (input.error) throw new Error("ETSY_CONNECT_CANCELLED");
      if (!input.code) throw new Error("MISSING_CHANNEL_CONNECT_PARAMS");
      const completed = await adapter.completeConnection(input.code, attempt.verifier);
      return attempts.finish(id, completed);
    }
  };
}
