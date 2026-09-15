import type { ChannelDraftPreview, Product, RemoteListingReference } from "@omnilist/shared";
import type { ChannelConnectionRecord } from "../../channels/channel-connections.repository";

export interface ChannelPublishExecutionResult {
  status: "published" | "failed";
  message: string;
  remoteListing?: RemoteListingReference;
  updatedCredentials?: Record<string, string>;
  requiresReconciliation?: boolean;
}

export interface ChannelPublishCheckpoint {
  stage: "inventory_written" | "offer_saved" | "publish_requested";
  remoteListing?: RemoteListingReference;
}

export interface ChannelPublishExecution {
  checkpoint(checkpoint: ChannelPublishCheckpoint): Promise<void>;
}

export interface ChannelPublishAdapter {
  buildDraft(product: Product, connection?: ChannelConnectionRecord): ChannelDraftPreview;
  publish(product: Product, connection: ChannelConnectionRecord, remoteListing?: RemoteListingReference,
    execution?: ChannelPublishExecution): Promise<ChannelPublishExecutionResult>;
}
