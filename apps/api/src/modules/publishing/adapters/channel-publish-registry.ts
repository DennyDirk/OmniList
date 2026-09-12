import type { ChannelDraftPreview, ChannelId } from "@omnilist/shared";

import type { ApiEnv } from "../../../config/env";
import type { ChannelConnectionRecord } from "../../channels/channel-connections.repository";
import type { Product } from "@omnilist/shared";
import { createEbayPublishAdapter } from "./ebay-publish.adapter";
import type { ChannelPublishAdapter, ChannelPublishExecutionResult } from "./channel-publish.contract";

export function createChannelPublishRegistry(env: ApiEnv) {
  const adapters = new Map<ChannelId, ChannelPublishAdapter>();
  adapters.set("ebay", createEbayPublishAdapter(env));

  return {
    getAdapter(channelId: ChannelId) {
      return adapters.get(channelId);
    },
    buildDraft(product: Product, channelId: ChannelId, connection?: ChannelConnectionRecord): ChannelDraftPreview | undefined {
      return adapters.get(channelId)?.buildDraft(product, connection);
    },
    async publish(product: Product, channelId: ChannelId, connection: ChannelConnectionRecord): Promise<ChannelPublishExecutionResult | undefined> {
      const adapter = adapters.get(channelId);

      if (!adapter) {
        return undefined;
      }

      return adapter.publish(product, connection);
    }
  };
}
