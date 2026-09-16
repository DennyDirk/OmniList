import { isDeepStrictEqual } from "node:util";
import type { ApiEnv } from "../../config/env";
import type { ChannelConnectionRecord, ChannelConnectionRepository } from "../channels/channel-connections.repository";
import { ensureValidEbayAccessToken } from "../channels/adapters/ebay-client";
import { getEbayOfferStatus } from "../channels/adapters/ebay-listing-status";
import type { RemoteListingReference } from "@omnilist/shared";
import type { ChannelListing, ChannelListingRepository, ListingIdentity } from "./channel-listings.repository";

export class EbayRecoveryError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export interface EbayRecoveryOutcome {
  productId: string;
  connectionId: string;
  status: "published" | "retryable" | "needs_review";
  message: string;
  listingId?: string;
  url?: string;
  remoteListing?: RemoteListingReference;
  revisionVerified?: false;
}

function identityOf(listing: ChannelListing): ListingIdentity {
  return {
    workspaceId: listing.workspaceId, productId: listing.productId, connectionId: listing.connectionId,
    channelId: listing.channelId, environment: listing.environment, marketplaceId: listing.marketplaceId,
    sku: listing.sku, externalAccountId: listing.externalAccountId
  };
}

function matchesConnection(listing: ChannelListing, record: ChannelConnectionRecord | undefined) {
  return Boolean(record && record.connection.status === "connected" && record.connection.workspaceId === listing.workspaceId
    && record.connection.id === listing.connectionId && record.connection.channelId === "ebay"
    && (record.connection.externalAccountId ?? "") === listing.externalAccountId
    && record.credentials.environment === listing.environment);
}

export function createEbayRecoveryService(connections: ChannelConnectionRepository, listings: ChannelListingRepository, env: ApiEnv) {
  async function saveCredentials(record: ChannelConnectionRecord, credentials: Record<string, string>) {
    const current = await connections.getConnectionRecordById(record.connection.workspaceId, record.connection.id);
    if (!current || !isDeepStrictEqual(current.connection, record.connection)
      || current.credentials.refreshToken !== record.credentials.refreshToken) {
      throw new EbayRecoveryError(409, "The eBay connection changed during recovery.");
    }
    await connections.setCredentialsForConnection(record.connection.workspaceId, record.connection.id, record.credentials, credentials);
  }

  async function recoverListing(candidate: ChannelListing): Promise<EbayRecoveryOutcome> {
    const listing = await listings.get(identityOf(candidate));
    if (!listing || listing.status !== "needs_review") throw new EbayRecoveryError(409, "No stopped publication is available for safe recovery.");
    if (listing.channelId !== "ebay") throw new EbayRecoveryError(409, "Only eBay publication recovery is available.");
    const identity = identityOf(listing);
    const found = await connections.getConnectionRecordById(listing.workspaceId, listing.connectionId);
    if (!matchesConnection(listing, found)) {
      return { productId: listing.productId, connectionId: listing.connectionId, status: "needs_review",
        message: "The connected eBay account changed. Review the listing before retrying." };
    }
    const record = structuredClone(found!);
    let auth;
    try { auth = await ensureValidEbayAccessToken(env, record.credentials); }
    catch {
      return { productId: listing.productId, connectionId: listing.connectionId, status: "needs_review",
        message: "eBay could not be authorized. Reconnect the account before recovery." };
    }

    const saved = listing.remoteListing;
    if (!saved) throw new EbayRecoveryError(409, "No saved offer is available for safe recovery.");
    try {
      if (saved.channelId !== "ebay" || !saved.offerId) {
        throw new EbayRecoveryError(409, "The saved publication reference is not an eBay offer.");
      }
      const offer = await getEbayOfferStatus(env, auth.accessToken, saved.offerId, listing.marketplaceId);
      await saveCredentials(record, auth.credentials);
      if (offer.sku !== listing.sku || offer.marketplaceId !== listing.marketplaceId
        || (saved.listingId && saved.listingId !== offer.listingId)) {
        return { productId: listing.productId, connectionId: listing.connectionId, status: "needs_review",
          message: "The recovered eBay offer does not match the saved product. No retry was enabled." };
      }
      if (offer.status === "PUBLISHED" && offer.listingStatus === "ACTIVE" && offer.listingId) {
        await listings.reconcileActive(identity, saved, { ...saved, listingId: offer.listingId });
        return { productId: listing.productId, connectionId: listing.connectionId, status: "published",
          listingId: offer.listingId, url: offer.url, revisionVerified: false, remoteListing: { ...saved, listingId: offer.listingId },
          message: `Recovered active eBay listing ${offer.listingId}.` };
      }
      if (offer.status === "UNPUBLISHED" && !offer.listingId) {
        await listings.markRetryable(identity, saved);
        return { productId: listing.productId, connectionId: listing.connectionId, status: "retryable",
          remoteListing: saved, message: "The saved eBay offer is unpublished. It is safe to retry without creating another offer." };
      }
      return { productId: listing.productId, connectionId: listing.connectionId, status: "needs_review",
        message: "eBay did not confirm an active or safely retryable offer. The publication remains blocked." };
    } catch (error) {
      if (error instanceof EbayRecoveryError) throw error;
      return { productId: listing.productId, connectionId: listing.connectionId, status: "needs_review",
        message: "Could not confirm the interrupted eBay publication. No new offer was created." };
    }
  }

  return {
    async recover(workspaceId: string, product: { id: string; sku: string }) {
      const found = await connections.getConnectionRecord(workspaceId, "ebay");
      if (!found || found.connection.status !== "connected") throw new EbayRecoveryError(409, "Connect eBay before recovering the listing.");
      const identity: ListingIdentity = { workspaceId, productId: product.id, sku: product.sku, channelId: "ebay",
        connectionId: found.connection.id, environment: env.ebayEnvironment,
        marketplaceId: found.connection.metadata.marketplaceId?.trim() || "EBAY_US",
        externalAccountId: found.connection.externalAccountId ?? "" };
      const listing = await listings.get(identity);
      if (!listing || listing.status !== "needs_review" || !listing.remoteListing) {
        throw new EbayRecoveryError(409, "No saved offer is available for safe recovery.");
      }
      const outcome = await recoverListing(listing);
      if (outcome.status === "needs_review") throw new EbayRecoveryError(409, outcome.message);
      return outcome;
    },
    async recoverInterrupted() {
      const outcomes: EbayRecoveryOutcome[] = [];
      for (const listing of await listings.listInterrupted()) {
        if (listing.channelId !== "ebay" || listing.status !== "needs_review") continue;
        try { outcomes.push(await recoverListing(listing)); }
        catch (error) {
          outcomes.push({ productId: listing.productId, connectionId: listing.connectionId, status: "needs_review",
            message: error instanceof Error ? error.message : "The interrupted publication requires review." });
        }
      }
      return outcomes;
    }
  };
}
