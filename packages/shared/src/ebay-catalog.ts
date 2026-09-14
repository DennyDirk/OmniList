import { z } from "zod";

export const ebayCatalogPageSchema = z.object({
  connectionId: z.string(),
  environment: z.enum(["sandbox", "production"]),
  offset: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
  total: z.number().int().nonnegative(),
  items: z.array(z.object({
    sku: z.string(),
    title: z.string(),
    condition: z.string().optional()
  }))
});

export type EbayCatalogPage = z.infer<typeof ebayCatalogPageSchema>;

export const ebayActiveListingsPageSchema = z.object({
  connectionId: z.string(),
  environment: z.enum(["sandbox", "production"]),
  page: z.number().int().positive(),
  nextPage: z.number().int().positive().nullable(),
  total: z.number().int().nonnegative(),
  limited: z.boolean(),
  warning: z.boolean(),
  items: z.array(z.object({
    listingId: z.string(), title: z.string(), sku: z.string().optional(),
    listingType: z.string(),
    price: z.object({ value: z.string(), currency: z.string() }).optional(),
    quantity: z.number().int().nonnegative().optional()
  }))
});
export type EbayActiveListingsPage = z.infer<typeof ebayActiveListingsPageSchema>;

export const ebayListingDetailsSchema = z.object({
  source: z.object({ channelId: z.literal("ebay"), api: z.literal("trading"), connectionId: z.string().min(1),
    environment: z.enum(["sandbox", "production"]), listingId: z.string().regex(/^\d{1,19}$/), sellerId: z.string().min(1) }),
  checkedAt: z.string().datetime(),
  title: z.string().min(1), sku: z.string().optional(), site: z.string(), listingType: z.string(), listingStatus: z.string(),
  category: z.object({ id: z.string(), name: z.string().optional() }).optional(),
  condition: z.object({ id: z.string(), name: z.string().optional() }).optional(),
  price: z.object({ value: z.string().regex(/^\d+(\.\d+)?$/), currency: z.string().regex(/^[A-Z]{3}$/) }).optional(),
  quantity: z.number().int().nonnegative().optional(),
  hasVariations: z.boolean(),
  aspects: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
  pictureCount: z.number().int().nonnegative(), hasDescription: z.boolean(),
  limitations: z.array(z.enum(["variations", "listing_type", "market", "inactive", "missing_price", "missing_quantity", "upstream_warning"])),
  importAvailable: z.literal(false)
});
export type EbayListingDetails = z.infer<typeof ebayListingDetailsSchema>;
