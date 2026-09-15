import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ChannelId, RemoteListingReference } from "@omnilist/shared";
import type { DbClient } from "../../db/client";
import { channelConnectionsTable, channelListingsTable as table, productsTable, workspacesTable } from "../../db/schema";

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
  executionStage: "claimed" | "inventory_written" | "offer_saved" | "publish_requested" | "finished";
  attemptRevision: string | null;
  appliedRevision: string | null;
  lastPublishedAt: Date | null;
  updatedAt: Date;
}

export class ListingOwnershipError extends Error {}

export interface ChannelListingRepository {
  get(identity: ListingIdentity): Promise<ChannelListing | undefined>;
  reconcileActive(identity: ListingIdentity, expected: RemoteListingReference, confirmed: RemoteListingReference): Promise<void>;
  prepareRecovery(listing: ChannelListing): Promise<ChannelListing | undefined>;
  adoptOffer(identity: ListingIdentity, remoteListing: RemoteListingReference): Promise<ChannelListing>;
  markRetryable(identity: ListingIdentity, expected?: RemoteListingReference): Promise<void>;
  listInterrupted(): Promise<ChannelListing[]>;
  reserve(identity: ListingIdentity): Promise<ChannelListing>;
  claim(identity: ListingIdentity, revision?: string): Promise<ChannelListing>;
  recordCheckpoint(identity: ListingIdentity, revision: string, checkpoint: {
    stage: "inventory_written" | "offer_saved" | "publish_requested";
    remoteListing?: RemoteListingReference;
  }): Promise<void>;
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
      if (!listing || !["publishing", "needs_review"].includes(listing.status) || !isDeepStrictEqual(listing.remoteListing, expected)) {
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
      const update = { status: "published" as const, executionStage: "finished" as const,
        remoteListing: confirmed, appliedRevision: null, lastPublishedAt: new Date(), updatedAt: new Date() };
      if (db) {
        const [updated] = await db.update(table).set(update).where(and(productScope(identity),
          inArray(table.status, ["publishing", "needs_review"]), eq(table.remoteListing, expected),
          eq(table.externalAccountId, identity.externalAccountId), eq(table.sku, identity.sku))).returning();
        if (!updated) throw new ListingOwnershipError("The listing changed. Verify it again before recovery.");
      } else {
        const current = memory.get(key(identity));
        if (!current || !["publishing", "needs_review"].includes(current.status) || !isDeepStrictEqual(current.remoteListing, expected)) {
          throw new ListingOwnershipError("The listing changed. Verify it again before recovery.");
        }
        memory.set(key(identity), { ...current, ...update });
      }
    },
    async prepareRecovery(listing) {
      const identity: ListingIdentity = listing;
      const current = await this.get(identity);
      if (!current || !["publishing", "needs_review"].includes(current.status)) return undefined;
      if (current.status === "needs_review") return current;
      const update = { status: "needs_review" as const, updatedAt: new Date() };
      if (db) {
        const [updated] = await db.update(table).set(update).where(and(productScope(identity),
          eq(table.status, "publishing"), eq(table.externalAccountId, listing.externalAccountId),
          eq(table.sku, listing.sku))).returning();
        return updated ? structuredClone(updated) : undefined;
      }
      const stored = memory.get(key(identity));
      if (!stored || stored.status !== "publishing") return undefined;
      const next = { ...stored, ...update };
      memory.set(key(identity), next);
      return structuredClone(next);
    },
    async adoptOffer(identity, remoteListing) {
      if (remoteListing.channelId !== "ebay" || remoteListing.environment !== identity.environment
        || remoteListing.marketplaceId !== identity.marketplaceId || remoteListing.sku !== identity.sku) {
        throw new ListingOwnershipError("The recovered offer does not match the reserved listing.");
      }
      const update = { remoteListing, executionStage: "offer_saved" as const, updatedAt: new Date() };
      if (db) {
        const [updated] = await db.update(table).set(update).where(and(productScope(identity),
          eq(table.status, "needs_review"), isNull(table.remoteListing),
          eq(table.externalAccountId, identity.externalAccountId), eq(table.sku, identity.sku))).returning();
        if (!updated) throw new ListingOwnershipError("The listing changed while recovering its offer.");
        return structuredClone(updated);
      }
      const current = memory.get(key(identity));
      if (!current || current.status !== "needs_review" || current.remoteListing) {
        throw new ListingOwnershipError("The listing changed while recovering its offer.");
      }
      const next = { ...current, ...update };
      memory.set(key(identity), next);
      return structuredClone(next);
    },
    async markRetryable(identity, expected) {
      const update = { status: "failed" as const, executionStage: "finished" as const, updatedAt: new Date() };
      if (db) {
        const remoteCondition = expected ? eq(table.remoteListing, expected) : isNull(table.remoteListing);
        const [updated] = await db.update(table).set(update).where(and(productScope(identity),
          eq(table.status, "needs_review"), remoteCondition,
          eq(table.externalAccountId, identity.externalAccountId), eq(table.sku, identity.sku))).returning();
        if (!updated) throw new ListingOwnershipError("The listing changed while making it retryable.");
        return;
      }
      const current = memory.get(key(identity));
      if (!current || current.status !== "needs_review" || !isDeepStrictEqual(current.remoteListing ?? undefined, expected)) {
        throw new ListingOwnershipError("The listing changed while making it retryable.");
      }
      memory.set(key(identity), { ...current, ...update });
    },
    async listInterrupted() {
      const items = db ? await db.select().from(table).where(inArray(table.status, ["publishing", "needs_review"]))
        : [...memory.values()].filter(item => item.status === "publishing" || item.status === "needs_review");
      return structuredClone(items);
    },
    async reserve(identity) {
      const initial: ChannelListing = { ...identity, id: crypto.randomUUID(), remoteListing: null,
        status: "pending", executionStage: "claimed", attemptRevision: null,
        appliedRevision: null, lastPublishedAt: null, updatedAt: new Date() };
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
    async claim(identity, revision = "unknown") {
      const message = "This listing is already publishing or requires verification after an interrupted attempt. No new request was sent to the store.";
      if (db) {
        return db.transaction(async tx => {
          // Import and publish use this same lock, so either operation observes the other's committed identity.
          const [workspace] = await tx.select({ id: workspacesTable.id }).from(workspacesTable)
            .where(eq(workspacesTable.id, identity.workspaceId)).for("update");
          if (!workspace) throw new ListingOwnershipError("Workspace not found.");
          const [connection] = await tx.select().from(channelConnectionsTable).where(and(
            eq(channelConnectionsTable.workspaceId, identity.workspaceId),
            eq(channelConnectionsTable.id, identity.connectionId)
          )).for("update");
          if (!connection || connection.status !== "connected" || connection.channelId !== identity.channelId
            || (connection.externalAccountId ?? "") !== identity.externalAccountId
            || connection.credentials.environment !== identity.environment) {
            throw new ListingOwnershipError("The connected store changed before publishing. Check the product again.");
          }
          if (identity.channelId === "ebay") {
            const [imported] = await tx.select({ id: productsTable.id }).from(productsTable).where(and(
              eq(productsTable.workspaceId, identity.workspaceId), eq(productsTable.sku, identity.sku),
              sql`${productsTable.source}->>'channelId' = 'ebay'`,
              sql`${productsTable.source}->>'environment' = ${identity.environment}`
            )).limit(1);
            if (imported) {
              throw new ListingOwnershipError("This eBay SKU was imported from an existing listing and cannot be published as a new offer.");
            }
          }
          const initial: ChannelListing = { ...identity, id: crypto.randomUUID(), remoteListing: null,
            status: "pending", executionStage: "claimed", attemptRevision: null,
            appliedRevision: null, lastPublishedAt: null, updatedAt: new Date() };
          await tx.insert(table).values(initial).onConflictDoNothing();
          const [listing] = await tx.select().from(table).where(productScope(identity)).limit(1);
          assertIdentity(listing, identity);
          const [claimed] = await tx.update(table).set({ status: "publishing", executionStage: "claimed",
            attemptRevision: revision, updatedAt: new Date() })
            .where(and(productScope(identity), inArray(table.status, ["pending", "published", "failed"]))).returning();
          if (!claimed) throw new ListingOwnershipError(message);
          return claimed;
        });
      }
      const listing = await this.reserve(identity);
      const current = memory.get(key(identity))!;
      if (current.status === "publishing" || current.status === "needs_review") throw new ListingOwnershipError(message);
      const claimed = { ...listing, status: "publishing" as const, executionStage: "claimed" as const,
        attemptRevision: revision, updatedAt: new Date() };
      memory.set(key(identity), claimed);
      return structuredClone(claimed);
    },
    async recordCheckpoint(identity, revision, checkpoint) {
      const listing = await this.get(identity);
      if (!listing || listing.status !== "publishing" || listing.attemptRevision !== revision) {
        throw new ListingOwnershipError("The publish attempt changed before its checkpoint was saved.");
      }
      const remote = checkpoint.remoteListing;
      if (remote && (remote.channelId !== identity.channelId || (remote.channelId === "ebay" &&
        (remote.environment !== identity.environment || remote.marketplaceId !== identity.marketplaceId || remote.sku !== identity.sku)))) {
        throw new ListingOwnershipError("The checkpoint offer does not match the reserved listing.");
      }
      const update = { executionStage: checkpoint.stage, ...(remote ? { remoteListing: remote } : {}), updatedAt: new Date() };
      if (db) {
        const [updated] = await db.update(table).set(update).where(and(productScope(identity),
          eq(table.status, "publishing"), eq(table.attemptRevision, revision),
          eq(table.externalAccountId, identity.externalAccountId), eq(table.sku, identity.sku))).returning();
        if (!updated) throw new ListingOwnershipError("The publish attempt changed before its checkpoint was saved.");
      } else {
        const current = memory.get(key(identity));
        if (!current || current.status !== "publishing" || current.attemptRevision !== revision) {
          throw new ListingOwnershipError("The publish attempt changed before its checkpoint was saved.");
        }
        memory.set(key(identity), { ...current, ...update });
      }
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
        executionStage: result.requiresReconciliation ? listing.executionStage : "finished" as const,
        ...(reference ? { remoteListing: reference } : {}),
        ...(result.status === "published" ? { appliedRevision: result.revision, lastPublishedAt: new Date() } : {}),
        updatedAt: new Date()
      };
      if (db) {
        const [updated] = await db.update(table).set(update).where(and(productScope(identity),
          eq(table.status, "publishing"), eq(table.attemptRevision, result.revision))).returning();
        if (!updated) throw new ListingOwnershipError("The publish attempt changed before its result was saved.");
      } else memory.set(key(identity), { ...listing, ...update });
    }
  };
}
