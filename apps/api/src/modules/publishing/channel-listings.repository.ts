import { and, eq, inArray } from "drizzle-orm";
import type { ChannelId, RemoteListingReference } from "@omnilist/shared";
import type { DbClient } from "../../db/client";
import { channelListingsTable as table } from "../../db/schema";

export interface ListingIdentity {
  workspaceId: string;
  productId: string;
  connectionId: string;
  channelId: ChannelId;
  environment: string;
  marketplaceId: string;
  sku: string;
  externalAccountId: string;
}

export interface ChannelListing extends ListingIdentity {
  id: string;
  remoteListing: RemoteListingReference | null;
  status: "pending" | "publishing" | "published" | "failed" | "needs_review";
  appliedRevision: string | null;
  lastPublishedAt: Date | null;
}

export class ListingOwnershipError extends Error {}

export interface ChannelListingRepository {
  get(identity: ListingIdentity): Promise<ChannelListing | undefined>;
  reconcileActive(identity: ListingIdentity, expected: RemoteListingReference, confirmed: RemoteListingReference): Promise<void>;
  reserve(identity: ListingIdentity): Promise<ChannelListing>;
  claim(identity: ListingIdentity): Promise<ChannelListing>;
  recordResult(identity: ListingIdentity, result: {
    status: "published" | "failed";
    remoteListing?: RemoteListingReference;
    revision: string;
    requiresReconciliation?: boolean;
  }): Promise<void>;
}

function assertIdentity(listing: ChannelListing | undefined, identity: ListingIdentity): asserts listing is ChannelListing {
  if (!listing) throw new ListingOwnershipError("This SKU is already assigned to another product in this store. Use that product to update the listing.");
  if (listing.channelId !== identity.channelId) throw new ListingOwnershipError("The reserved listing belongs to a different channel.");
  if (listing.sku !== identity.sku) throw new ListingOwnershipError("This product already has a reserved listing SKU. Restore its original SKU before publishing.");
  if (listing.externalAccountId !== identity.externalAccountId) throw new ListingOwnershipError("The connected seller account has changed. Review the existing listing before publishing.");
}

function productScope(identity: ListingIdentity) {
  return and(eq(table.workspaceId, identity.workspaceId), eq(table.productId, identity.productId),
    eq(table.connectionId, identity.connectionId), eq(table.environment, identity.environment),
    eq(table.marketplaceId, identity.marketplaceId));
}

export function createChannelListingRepository(db?: DbClient): ChannelListingRepository {
  const memory = new Map<string, ChannelListing>();
  const scope = (i: ListingIdentity) => JSON.stringify([i.workspaceId, i.connectionId, i.environment, i.marketplaceId]);
  const key = (i: ListingIdentity) => JSON.stringify([scope(i), i.productId]);

  return {
    async get(identity) {
      const listing = db
        ? (await db.select().from(table).where(productScope(identity)).limit(1))[0]
        : memory.get(key(identity));
      if (!listing) return undefined;
      assertIdentity(listing, identity);
      return structuredClone(listing);
    },
    async reconcileActive(identity, expected, confirmed) {
      const listing = await this.get(identity);
      if (!listing || listing.status !== "needs_review" || JSON.stringify(listing.remoteListing) !== JSON.stringify(expected)) {
        throw new ListingOwnershipError("The listing changed. Verify it again before recovery.");
      }
      if (expected.channelId !== "ebay" || confirmed.channelId !== "ebay"
        || expected.offerId !== confirmed.offerId || !confirmed.listingId
        || (expected.listingId && expected.listingId !== confirmed.listingId)
        || confirmed.environment !== identity.environment || confirmed.marketplaceId !== identity.marketplaceId
        || confirmed.sku !== identity.sku) {
        throw new ListingOwnershipError("The confirmed offer does not match the saved listing.");
      }
      // Existence is confirmed, but the remote payload's revision is not known.
      const update = { status: "published" as const, remoteListing: confirmed, appliedRevision: null };
      if (db) {
        const [updated] = await db.update(table).set(update).where(and(productScope(identity),
          eq(table.status, "needs_review"), eq(table.remoteListing, expected),
          eq(table.externalAccountId, identity.externalAccountId), eq(table.sku, identity.sku))).returning();
        if (!updated) throw new ListingOwnershipError("The listing changed. Verify it again before recovery.");
      } else {
        const current = memory.get(key(identity));
        if (!current || current.status !== "needs_review" || JSON.stringify(current.remoteListing) !== JSON.stringify(expected)) {
          throw new ListingOwnershipError("The listing changed. Verify it again before recovery.");
        }
        memory.set(key(identity), { ...current, ...update });
      }
    },
    async reserve(identity) {
      const initial: ChannelListing = { ...identity, id: crypto.randomUUID(), remoteListing: null,
        status: "pending", appliedRevision: null, lastPublishedAt: null };
      if (db) {
        // Both unique constraints arbitrate concurrent reservations in PostgreSQL.
        await db.insert(table).values(initial).onConflictDoNothing();
        const [listing] = await db.select().from(table).where(productScope(identity)).limit(1);
        assertIdentity(listing, identity);
        return listing;
      }
      let listing = memory.get(key(identity));
      if (!listing && ![...memory.values()].some(item => scope(item) === scope(identity) && item.sku === identity.sku)) {
        memory.set(key(identity), initial);
        listing = initial;
      }
      assertIdentity(listing, identity);
      return structuredClone(listing);
    },
    async claim(identity) {
      const listing = await this.reserve(identity);
      const message = "This listing is already publishing or requires verification after an interrupted attempt. No new request was sent to the store.";
      if (db) {
        const [claimed] = await db.update(table).set({ status: "publishing" })
          .where(and(productScope(identity), inArray(table.status, ["pending", "published", "failed"]))).returning();
        if (!claimed) throw new ListingOwnershipError(message);
        return claimed;
      }
      const current = memory.get(key(identity))!;
      if (current.status === "publishing" || current.status === "needs_review") throw new ListingOwnershipError(message);
      const claimed = { ...listing, status: "publishing" as const };
      memory.set(key(identity), claimed);
      return structuredClone(claimed);
    },
    async recordResult(identity, result) {
      const listing = db
        ? (await db.select().from(table).where(productScope(identity)).limit(1))[0]
        : memory.get(key(identity));
      assertIdentity(listing, identity);
      if (listing.status !== "publishing") throw new ListingOwnershipError("The listing is not claimed for publication.");
      const remote = result.remoteListing;
      if (remote && (remote.channelId !== identity.channelId || (remote.channelId === "ebay" &&
          (remote.environment !== identity.environment || remote.marketplaceId !== identity.marketplaceId || remote.sku !== identity.sku)))) {
        throw new ListingOwnershipError("The remote listing does not match the reserved store, market or SKU.");
      }
      if (result.status === "published" && (!remote || (remote.channelId !== "shopify" && !remote.listingId))) {
        throw new ListingOwnershipError("The store did not confirm an external listing ID. Check the store before retrying.");
      }
      const previous = listing.remoteListing;
      const reference = remote?.channelId === "ebay" && previous?.channelId === "ebay" && remote.offerId === previous.offerId
        ? { ...previous, ...remote } : remote;
      const update = {
        status: result.requiresReconciliation ? "needs_review" as const : result.status,
        ...(reference ? { remoteListing: reference } : {}),
        ...(result.status === "published" ? { appliedRevision: result.revision, lastPublishedAt: new Date() } : {})
      };
      if (db) await db.update(table).set(update).where(productScope(identity));
      else memory.set(key(identity), { ...listing, ...update });
    }
  };
}
