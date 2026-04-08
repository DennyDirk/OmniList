import { z } from "zod";

export const channelIdSchema = z.enum(["shopify", "ebay", "etsy"]);
export const connectionStatusSchema = z.enum(["connected", "attention_required", "disconnected"]);
export const authProviderIdSchema = z.enum(["google", "facebook"]);
export const workspacePlanSchema = z.enum(["free", "pro"]);
export const inventoryAdjustmentSourceSchema = z.enum(["manual", "order", "channel_sync"]);
export const publishJobStatusSchema = z.enum(["queued", "processing", "completed", "partial", "failed"]);
export const publishTargetStatusSchema = z.enum(["queued", "processing", "published", "failed"]);

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  subscriptionPlan: workspacePlanSchema
});

export const workspaceUsageSchema = z.object({
  workspaceId: z.string().min(1),
  subscriptionPlan: workspacePlanSchema,
  productCount: z.number().int().nonnegative(),
  productLimit: z.number().int().positive().nullable(),
  productsRemaining: z.number().int().nonnegative().nullable(),
  aiIncluded: z.boolean()
});

export const workspacePlanChangeInputSchema = z.object({
  subscriptionPlan: workspacePlanSchema
});

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  workspaceId: z.string().min(1)
});

export const authSessionSchema = z.object({
  user: userSchema,
  workspace: workspaceSchema
});

export const authProviderSchema = z.object({
  id: authProviderIdSchema,
  name: z.string().min(1),
  enabled: z.boolean()
});

export const channelConnectionSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  channelId: channelIdSchema,
  status: connectionStatusSchema,
  externalAccountId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.string())
});

export const channelConnectionUpsertInputSchema = channelConnectionSchema.omit({
  id: true,
  workspaceId: true,
  channelId: true
});

function isSupportedAssetUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:", "data:"].includes(url.protocol);
  } catch {
    return false;
  }
}

export const productAssetSchema = z.object({
  id: z.string().min(1),
  url: z.string().refine(isSupportedAssetUrl, {
    message: "Image must be an http(s) or data URL."
  }),
  altText: z.string().min(1).optional()
});

export const productVariantOptionSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1)
});

export const productVariantSchema = z.object({
  id: z.string().min(1),
  sku: z.string().min(1),
  price: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
  options: z.array(productVariantOptionSchema)
});

export const productChannelOverrideSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  price: z.number().nonnegative().optional()
});

export const productChannelOverridesSchema = z
  .object({
    shopify: productChannelOverrideSchema.optional(),
    ebay: productChannelOverrideSchema.optional(),
    etsy: productChannelOverrideSchema.optional()
  })
  .default({});

export const productSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(3),
  description: z.string().min(10),
  brand: z.string().min(1).optional(),
  sku: z.string().min(1),
  basePrice: z.number().nonnegative(),
  quantity: z.number().int().nonnegative(),
  categoryId: z.string().min(1).optional(),
  categoryLabel: z.string().min(1).optional(),
  images: z.array(productAssetSchema),
  attributes: z.record(z.string(), z.string()),
  variants: z.array(productVariantSchema),
  channelOverrides: productChannelOverridesSchema
});

export const productUpsertInputSchema = productSchema.omit({
  id: true
});

export const publishPreviewRequestSchema = z.object({
  channels: z.array(channelIdSchema).min(1).optional()
});

export const publishJobRequestSchema = z.object({
  channels: z.array(channelIdSchema).min(1).optional()
});

export const bulkPublishJobRequestSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1),
  channels: z.array(channelIdSchema).min(1)
});

export const inventoryMovementSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  delta: z.number().int(),
  previousQuantity: z.number().int().nonnegative(),
  nextQuantity: z.number().int().nonnegative(),
  source: inventoryAdjustmentSourceSchema,
  reason: z.string().min(1).optional(),
  channelId: channelIdSchema.optional(),
  createdAt: z.string().min(1)
});

export const productInventorySnapshotSchema = z.object({
  productId: z.string().min(1),
  totalQuantity: z.number().int().nonnegative(),
  variantQuantities: z.array(
    z.object({
      variantId: z.string().min(1),
      sku: z.string().min(1),
      quantity: z.number().int().nonnegative()
    })
  ),
  recentMovements: z.array(inventoryMovementSchema)
});

export const inventoryAdjustmentInputSchema = z.object({
  variantId: z.string().min(1).optional(),
  delta: z.number().int().refine((value) => value !== 0, {
    message: "Inventory adjustment delta cannot be zero."
  }),
  source: inventoryAdjustmentSourceSchema.default("manual"),
  reason: z.string().min(2).max(240).optional(),
  channelId: channelIdSchema.optional()
});

export const registerInputSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  workspaceName: z.string().min(2).optional()
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export type ProductUpsertInput = z.infer<typeof productUpsertInputSchema>;
export type ChannelConnectionUpsertInput = z.infer<typeof channelConnectionUpsertInputSchema>;
export type InventoryAdjustmentInput = z.infer<typeof inventoryAdjustmentInputSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
