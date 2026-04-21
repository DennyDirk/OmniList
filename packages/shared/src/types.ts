export type ChannelId = "shopify" | "ebay" | "etsy";

export type ChannelKind = "store" | "marketplace";

export type IssueSeverity = "blocking" | "warning" | "suggestion";

export type PublishStatus = "ready" | "needs_attention";
export type PublishJobStatus = "queued" | "processing" | "completed" | "partial" | "failed";
export type PublishTargetStatus = "queued" | "processing" | "published" | "failed";

export type ConnectionStatus = "connected" | "attention_required" | "disconnected";
export type WorkspacePlan = "free" | "pro";
export type ChannelConnectionMode = "manual" | "oauth";
export type InventoryAdjustmentSource = "manual" | "order" | "channel_sync";

export interface Channel {
  id: ChannelId;
  name: string;
  kind: ChannelKind;
  region: string;
  description: string;
}

export interface Workspace {
  id: string;
  name: string;
  subscriptionPlan: WorkspacePlan;
}

export interface User {
  id: string;
  email: string;
  name: string;
  workspaceId: string;
}

export interface AuthSession {
  user: User;
  workspace: Workspace;
}

export interface ChannelConnection {
  id: string;
  workspaceId: string;
  channelId: ChannelId;
  status: ConnectionStatus;
  externalAccountId?: string;
  metadata: Record<string, string>;
}

export interface ChannelConnectionCapability {
  channelId: ChannelId;
  connectionMode: ChannelConnectionMode;
  enabled: boolean;
  providerLabel?: string;
}

export interface ProductAsset {
  id: string;
  url: string;
  altText?: string;
}

export interface ProductVariantOption {
  name: string;
  value: string;
}

export interface ProductVariant {
  id: string;
  sku: string;
  price: number;
  quantity: number;
  options: ProductVariantOption[];
}

export interface ProductChannelOverride {
  title?: string;
  description?: string;
  price?: number;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  brand?: string;
  sku: string;
  basePrice: number;
  quantity: number;
  categoryId?: string;
  categoryLabel?: string;
  images: ProductAsset[];
  attributes: Record<string, string>;
  variants: ProductVariant[];
  channelOverrides: Partial<Record<ChannelId, ProductChannelOverride>>;
}

export interface ValidationIssue {
  code: string;
  field: string;
  severity: IssueSeverity;
  message: string;
}

export interface ChannelReadiness {
  channelId: ChannelId;
  score: number;
  status: PublishStatus;
  issues: ValidationIssue[];
}

export interface PublishPreviewItem {
  channelId: ChannelId;
  channelName: string;
  title: string;
  categoryLabel: string;
  price: number;
  readinessScore: number;
  issueCount: number;
}

export interface PublishPreview {
  productId: string;
  items: PublishPreviewItem[];
}

export interface ChannelDraftPreview {
  channelId: ChannelId;
  channelName: string;
  title: string;
  price: number;
  categoryLabel?: string;
  missingConfiguration: string[];
  listingFormat?: string;
  payload: Record<string, unknown>;
}

export interface PublishJobTarget {
  id: string;
  channelId: ChannelId;
  channelName: string;
  status: PublishTargetStatus;
  readinessScore: number;
  issueCount: number;
  message?: string;
}

export interface PublishJob {
  id: string;
  workspaceId: string;
  productId: string;
  productTitle: string;
  status: PublishJobStatus;
  createdAt: string;
  updatedAt: string;
  targets: PublishJobTarget[];
}

export interface InventoryMovement {
  id: string;
  workspaceId: string;
  productId: string;
  variantId?: string;
  delta: number;
  previousQuantity: number;
  nextQuantity: number;
  source: InventoryAdjustmentSource;
  reason?: string;
  channelId?: ChannelId;
  createdAt: string;
}

export interface ProductInventorySnapshot {
  productId: string;
  totalQuantity: number;
  variantQuantities: Array<{
    variantId: string;
    sku: string;
    quantity: number;
  }>;
  recentMovements: InventoryMovement[];
}
