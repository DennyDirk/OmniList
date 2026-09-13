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
