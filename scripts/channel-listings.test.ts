import { test } from "node:test";
import assert from "node:assert/strict";
import { createChannelListingRepository, type ListingIdentity } from "../apps/api/src/modules/publishing/channel-listings.repository";

const identity: ListingIdentity = { workspaceId: "workspace", productId: "shirt", connectionId: "store", channelId: "ebay",
  environment: "sandbox", marketplaceId: "EBAY_US", sku: "SHIRT-1", externalAccountId: "seller" };
const remoteListing = { channelId: "ebay" as const, environment: "sandbox" as const,
  marketplaceId: "EBAY_US", sku: "SHIRT-1", offerId: "offer", listingId: "listing" };

test("reservations reuse the product binding and reject SKU ownership conflicts", async () => {
  const repo = createChannelListingRepository();
  const [first, second] = await Promise.all([repo.reserve(identity), repo.reserve(identity)]);
  assert.equal(first.id, second.id);
  await assert.rejects(repo.reserve({ ...identity, productId: "another-product" }), /already assigned/);
  await assert.rejects(repo.reserve({ ...identity, sku: "CHANGED" }), /original SKU/);
  await assert.rejects(repo.reserve({ ...identity, externalAccountId: "another-seller" }), /account has changed/);
});

test("reservations isolate workspaces, connections and environments", async () => {
  const repo = createChannelListingRepository();
  const first = await repo.reserve(identity);
  for (const override of [{ workspaceId: "other" }, { connectionId: "other" }, { environment: "production" }]) {
    const next = await repo.reserve({ ...identity, ...override });
    assert.notEqual(first.id, next.id);
  }
});

test("published version survives a failed attempt and remote IDs remain independent of jobs", async () => {
  const repo = createChannelListingRepository();
  await repo.claim(identity);
  await repo.recordResult(identity, { status: "published", remoteListing, revision: "v1" });
  await repo.claim(identity);
  await repo.recordResult(identity, { status: "failed", revision: "v2" });
  const listing = await repo.reserve(identity);
  assert.deepEqual(listing.remoteListing, remoteListing);
  assert.equal(listing.appliedRevision, "v1");
  assert(listing.lastPublishedAt instanceof Date);
  assert.equal(listing.status, "failed");
  listing.remoteListing = null;
  assert.deepEqual((await repo.reserve(identity)).remoteListing, remoteListing);
});

test("unreserved results and mismatched remote identities cannot be persisted", async () => {
  const repo = createChannelListingRepository();
  await assert.rejects(repo.recordResult(identity, { status: "published", remoteListing, revision: "v1" }));
  await repo.claim(identity);
  for (const override of [{ sku: "OTHER" }, { marketplaceId: "EBAY_GB" }, { environment: "production" as const }]) {
    await assert.rejects(repo.recordResult(identity, { status: "published", remoteListing: { ...remoteListing, ...override }, revision: "v1" }), /does not match/);
  }
  assert.equal((await repo.reserve(identity)).remoteListing, null);
});

test("a failed activation keeps the previously known listing ID for the same offer", async () => {
  const repo = createChannelListingRepository();
  await repo.claim(identity);
  await repo.recordResult(identity, { status: "published", remoteListing, revision: "v1" });
  const { listingId, ...offerOnly } = remoteListing;
  await repo.claim(identity);
  await repo.recordResult(identity, { status: "failed", remoteListing: offerOnly, revision: "v2" });
  assert.deepEqual((await repo.reserve(identity)).remoteListing, remoteListing);
});

test("an unconfirmed listing never advances the applied revision", async () => {
  const repo = createChannelListingRepository();
  await repo.claim(identity);
  await assert.rejects(repo.recordResult(identity, { status: "published", revision: "v1" }), /did not confirm/);
  const { listingId, ...offerOnly } = remoteListing;
  await assert.rejects(repo.recordResult(identity, { status: "published", remoteListing: offerOnly, revision: "v1" }), /did not confirm/);
  assert.equal((await repo.reserve(identity)).appliedRevision, null);
});
