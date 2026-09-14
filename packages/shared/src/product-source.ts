import { z } from "zod";

export const productSourceSchema = z.object({
  channelId: z.literal("ebay"), api: z.literal("trading"),
  connectionId: z.string().min(1).max(64), environment: z.enum(["sandbox", "production"]),
  listingId: z.string().regex(/^\d{1,19}$/), sellerId: z.string().min(1).max(256),
  currency: z.literal("USD"), importedAt: z.string().datetime()
});
export type ProductSource = z.infer<typeof productSourceSchema>;
