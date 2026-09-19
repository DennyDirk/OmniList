import { etsySetupOptionsSchema } from "@omnilist/shared";
import type { ApiEnv } from "../../config/env";
import { connectionRevision } from "../publishing/connection-revision";
import type { ChannelConnectionRepository } from "./channel-connections.repository";
import type { EtsySessionRepository } from "./etsy-session.repository";
import { createEtsySetupClient } from "./adapters/etsy-setup.client";

export function createEtsySetupService(env: ApiEnv, connections: ChannelConnectionRepository,
  sessions?: EtsySessionRepository, remote = createEtsySetupClient(env)) {
  return {
    async load(workspaceId: string) {
      if (!sessions || !env.etsyKeystring || !env.etsySharedSecret) throw new Error("CHANNEL_CONNECTOR_NOT_CONFIGURED");
      const snapshot = await sessions.authorize(workspaceId, credentials => remote.authorize(credentials));
      const options = await remote.setup(snapshot.credentials);
      const current = await connections.getConnectionRecordById(workspaceId, snapshot.connection.id);
      if (!current || connectionRevision(current, "production") !== connectionRevision(snapshot, "production")) {
        throw new Error("ETSY_CONNECTION_CHANGED");
      }
      return etsySetupOptionsSchema.parse({ ...options, connectionId: snapshot.connection.id,
        shopId: snapshot.connection.externalAccountId, checkedAt: new Date().toISOString() });
    }
  };
}
