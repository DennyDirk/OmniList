import type { ApiEnv } from "../../config/env";
import type { ChannelConnectionRepository } from "../channels/channel-connections.repository";
import { ensureValidEbayAccessToken } from "../channels/adapters/ebay-client";
import { getEbayOfferStatus } from "../channels/adapters/ebay-listing-status";
import type { ChannelListingRepository, ListingIdentity } from "./channel-listings.repository";

export class EbayRecoveryError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function createEbayRecoveryService(connections: ChannelConnectionRepository, listings: ChannelListingRepository, env: ApiEnv) {
  return {
    async recover(workspaceId: string, product: { id: string; sku: string }) {
      const found = await connections.getConnectionRecord(workspaceId, "ebay");
      if (!found || found.connection.status !== "connected" || found.connection.workspaceId !== workspaceId
        || found.connection.channelId !== "ebay") throw new EbayRecoveryError(409, "Connect eBay before verifying the listing.");
      const record = structuredClone(found);
      const identity: ListingIdentity = {
        workspaceId, productId: product.id, sku: product.sku, channelId: "ebay", connectionId: record.connection.id,
        environment: env.ebayEnvironment, marketplaceId: record.connection.metadata.marketplaceId?.trim() || "EBAY_US",
        externalAccountId: record.connection.externalAccountId ?? ""
      };
      const listing = await listings.get(identity);
      const saved = listing?.remoteListing;
      if (!listing || listing.status !== "needs_review" || saved?.channelId !== "ebay" || !saved.offerId) {
        throw new EbayRecoveryError(409, "No saved offer is available for safe recovery. Manual verification is required.");
      }
      const auth = await ensureValidEbayAccessToken(env, record.credentials);
      const offer = await getEbayOfferStatus(env, auth.accessToken, saved.offerId, identity.marketplaceId);
      if (offer.status !== "PUBLISHED" || offer.listingStatus !== "ACTIVE" || !offer.listingId
        || offer.sku !== identity.sku || (saved.listingId && saved.listingId !== offer.listingId)) {
        throw new EbayRecoveryError(409, "The saved offer is not confirmed active. The listing remains blocked for verification.");
      }
      const current = await connections.getConnectionRecordById(workspaceId, record.connection.id);
      if (!current || JSON.stringify(current.connection) !== JSON.stringify(record.connection)
        || current.credentials.refreshToken !== record.credentials.refreshToken) {
        throw new EbayRecoveryError(409, "The eBay connection changed. Verify the listing again.");
      }
      await connections.setCredentialsForConnection(workspaceId, record.connection.id, record.credentials, auth.credentials);
      await listings.reconcileActive(identity, saved, { ...saved, listingId: offer.listingId });
      return { status: "published" as const, listingId: offer.listingId, url: offer.url, revisionVerified: false };
    }
  };
}
