import { test } from "node:test";
import assert from "node:assert/strict";
import { ebayRecoveryResultSchema, getEbayListingUrl } from "@omnilist/shared";

const remote = { channelId: "ebay" as const, environment: "sandbox" as const, marketplaceId: "EBAY_US", sku: "SHIRT", offerId: "offer" };
const retryable = { productId: "product", connectionId: "connection", status: "retryable", remoteListing: remote };
const published = { ...retryable, status: "published", listingId: "123", revisionVerified: false,
  remoteListing: { ...remote, listingId: "123" } };

test("recovery contract distinguishes a confirmed listing from an unpublished offer", () => {
  assert(ebayRecoveryResultSchema.safeParse(retryable).success);
  assert(ebayRecoveryResultSchema.safeParse(published).success);
  for (const item of [
    { ...published, revisionVerified: true }, { ...published, listingId: "456" },
    { ...published, listingId: undefined }, { ...published, revisionVerified: undefined },
    { ...retryable, remoteListing: published.remoteListing }, { ...retryable, listingId: "123" },
    { ...retryable, status: "needs_review" }, { ...retryable, remoteListing: undefined }
  ]) assert.equal(ebayRecoveryResultSchema.safeParse(item).success, false);
});

test("listing links use the saved environment and never trust an arbitrary URL", () => {
  assert.equal(getEbayListingUrl(published.remoteListing), "https://www.sandbox.ebay.com/itm/123");
  assert.equal(getEbayListingUrl({ ...published.remoteListing, environment: "production" }), "https://www.ebay.com/itm/123");
  assert.equal(getEbayListingUrl(remote), undefined);
  assert.equal(getEbayListingUrl({ ...remote, listingId: "../other" }), undefined);
  assert.equal(getEbayListingUrl({ channelId: "etsy", shopId: "shop", listingId: "123" }), undefined);
  const parsed = ebayRecoveryResultSchema.parse({ ...published, url: "https://untrusted.example" });
  assert.equal("url" in parsed, false);
});
