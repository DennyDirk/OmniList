import { z } from "zod";
import type { RemoteListingReference } from "./types";

const remoteOffer = z.object({
  channelId: z.literal("ebay"),
  environment: z.enum(["sandbox", "production"]),
  marketplaceId: z.string().min(1),
  sku: z.string().min(1),
  offerId: z.string().min(1),
  listingId: z.string().regex(/^\d+$/).optional()
});

export const ebayRecoveryResultSchema = z.object({
  productId: z.string().min(1),
  connectionId: z.string().min(1),
  status: z.enum(["published", "retryable"]),
  remoteListing: remoteOffer,
  listingId: z.string().regex(/^\d+$/).optional(),
  revisionVerified: z.literal(false).optional()
}).superRefine((result, ctx) => {
  const valid = result.status === "published"
    ? result.revisionVerified === false && Boolean(result.listingId) && result.listingId === result.remoteListing.listingId
    : !result.listingId && !result.remoteListing.listingId;
  if (!valid) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inconsistent recovery result" });
});

export type EbayRecoveryResult = z.infer<typeof ebayRecoveryResultSchema>;

// Construct links from typed identity rather than trusting a provider-supplied URL.
export function getEbayListingUrl(remote?: RemoteListingReference): string | undefined {
  if (remote?.channelId !== "ebay" || !remote.listingId || !/^\d+$/.test(remote.listingId)) return;
  if (remote.environment !== "sandbox" && remote.environment !== "production") return;
  return `https://www.${remote.environment === "sandbox" ? "sandbox." : ""}ebay.com/itm/${remote.listingId}`;
}
