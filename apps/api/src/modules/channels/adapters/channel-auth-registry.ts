import { channels, type ChannelConnectionCapability, type ChannelId } from "@omnilist/shared";

import type { ApiEnv } from "../../../config/env";
import { createEbayOAuthAdapter, type ChannelOAuthAdapter } from "./ebay-oauth.adapter";

export function createChannelAuthRegistry(env: ApiEnv) {
  const adapters = new Map<ChannelId, ChannelOAuthAdapter>();
  const ebayAdapter = createEbayOAuthAdapter(env);

  if (ebayAdapter) {
    adapters.set("ebay", ebayAdapter);
  }

  return {
    getAdapter(channelId: ChannelId) {
      return adapters.get(channelId);
    },
    listCapabilities(): ChannelConnectionCapability[] {
      return channels.map((channel) => {
        const adapter = adapters.get(channel.id);

        if (channel.id === "ebay") {
          return {
            channelId: channel.id,
            connectionMode: "oauth",
            enabled: Boolean(adapter),
            providerLabel: "eBay OAuth"
          };
        }

        if (!adapter) {
          return {
            channelId: channel.id,
            connectionMode: "manual",
            enabled: false
          };
        }

        return {
          channelId: channel.id,
          connectionMode: "oauth",
          enabled: adapter.isConfigured(),
          providerLabel: adapter.providerLabel
        };
      });
    }
  };
}
