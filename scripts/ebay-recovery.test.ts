import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiEnv } from "../apps/api/src/config/env";
import { createChannelConnectionRepository } from "../apps/api/src/modules/channels/channel-connections.repository";
import { createChannelListingRepository, type ListingIdentity } from "../apps/api/src/modules/publishing/channel-listings.repository";
import { createEbayRecoveryService } from "../apps/api/src/modules/publishing/ebay-recovery.service";
import { createEbayActiveCatalogService } from "../apps/api/src/modules/catalog/ebay-active-catalog.service";
import { ebayActiveListingsPageSchema } from "../packages/shared/src/ebay-catalog";

const env: ApiEnv = { nodeEnv: "test", port: 4000, publicApiUrl: "http://localhost:4000", publicWebUrl: "http://localhost:3000",
  ebayEnvironment: "sandbox", ebayScopes: [], supabaseStorageBucket: "images" };
const remote = { channelId: "ebay" as const, environment: "sandbox" as const, marketplaceId: "EBAY_US", sku: "SHIRT", offerId: "offer" };
const active = { offerId: "offer", marketplaceId: "EBAY_US", sku: "SHIRT", status: "PUBLISHED", listing: { listingId: "123", listingStatus: "ACTIVE" } };
const emptyCatalog = "<GetMyeBaySellingResponse><Ack>Success</Ack><ActiveList><PaginationResult><TotalNumberOfEntries>0</TotalNumberOfEntries><TotalNumberOfPages>0</TotalNumberOfPages></PaginationResult></ActiveList></GetMyeBaySellingResponse>";

async function setup() {
  const connections = createChannelConnectionRepository();
  const connection = await connections.upsertConnection("workspace", "ebay", { status: "connected", externalAccountId: "seller", metadata: {} });
  await connections.setCredentials("workspace", "ebay", { accessToken: "secret", refreshToken: "refresh", environment: "sandbox", accessTokenExpiresAt: "2099-01-01" });
  const listings = createChannelListingRepository();
  const identity: ListingIdentity = { workspaceId: "workspace", productId: "shirt", connectionId: connection.id, channelId: "ebay", environment: "sandbox", marketplaceId: "EBAY_US", sku: "SHIRT", externalAccountId: "seller" };
  const service = createEbayRecoveryService(connections, listings, env);
  const catalog = createEbayActiveCatalogService(connections, env);
  return { connections, listings, identity, service, catalog };
}
async function withFetch(fn: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try { await run(); } finally { globalThis.fetch = original; }
}
const product = { id: "shirt", sku: "SHIRT" };

test("recovery confirms only a saved active offer without asserting a payload revision", async () => {
  const { listings, identity, service } = await setup();
  await listings.claim(identity);
  await listings.recordResult(identity, { status: "failed", remoteListing: remote, revision: "unknown", requiresReconciliation: true });
  await withFetch(async (url, init) => {
    assert.equal(String(url), "https://api.sandbox.ebay.com/sell/inventory/v1/offer/offer");
    assert.equal(init?.method, "GET");
    return Response.json(active);
  }, async () => {
    const result = await service.recover("workspace", product);
    assert.equal(result.listingId, "123");
    assert.equal(result.revisionVerified, false);
    assert.equal((await listings.get(identity))?.status, "published");
    assert.equal((await listings.get(identity))?.appliedRevision, null);
    await assert.rejects(service.recover("workspace", product), /safe recovery/);
    await listings.claim(identity);
  });
});

test("recovery never creates a binding, guesses an offer or unlocks an executing job", async () => {
  const { listings, identity, service } = await setup();
  await withFetch(async () => { assert.fail("No external call expected"); }, async () => {
    await assert.rejects(service.recover("workspace", product), /safe recovery/);
    assert.equal(await listings.get(identity), undefined);
    await listings.claim(identity);
    await assert.rejects(service.recover("workspace", product), /safe recovery/);
    await listings.recordResult(identity, { status: "failed", revision: "unknown", requiresReconciliation: true });
    await assert.rejects(service.recover("workspace", product), /safe recovery/);
    await assert.rejects(service.recover("other", product), /Connect/);
    assert.equal((await listings.get(identity))?.status, "needs_review");
  });
});

test("recovery preserves review for inactive, missing, mismatched or unavailable offers", async () => {
  const { listings, identity, service } = await setup();
  await listings.claim(identity);
  await listings.recordResult(identity, { status: "failed", remoteListing: { ...remote, listingId: "123" }, revision: "unknown", requiresReconciliation: true });
  for (const response of [
    () => Response.json({ ...active, status: "UNPUBLISHED" }),
    () => Response.json({ ...active, listing: { listingId: "123", listingStatus: "ENDED" } }),
    () => Response.json({ ...active, listing: { listingId: "456", listingStatus: "ACTIVE" } }),
    () => Response.json({ ...active, sku: "OTHER" }),
    () => Response.json({ ...active, marketplaceId: "EBAY_GB" }),
    () => Response.json({ errors: [{ errorId: 25713 }] }, { status: 404 }),
    () => Response.json({}, { status: 500 })
  ]) {
    await withFetch(async () => response(), async () => {
      await assert.rejects(service.recover("workspace", product));
      assert.equal((await listings.get(identity))?.status, "needs_review");
    });
  }
});

test("recovery rejects replacement of the connection while verifying the offer", async () => {
  const { connections, listings, identity, service } = await setup();
  await listings.claim(identity);
  await listings.recordResult(identity, { status: "failed", remoteListing: remote, revision: "unknown", requiresReconciliation: true });
  await withFetch(async () => {
    await connections.upsertConnection("workspace", "ebay", { status: "connected", externalAccountId: "replacement", metadata: {} });
    return Response.json(active);
  }, async () => {
    await assert.rejects(service.recover("workspace", product), /connection changed/);
    assert.equal((await listings.get(identity))?.status, "needs_review");
  });
});

test("competing in-memory recoveries cannot both release the same review state", async () => {
  const { listings, identity } = await setup();
  await listings.claim(identity);
  await listings.recordResult(identity, { status: "failed", remoteListing: remote, revision: "unknown", requiresReconciliation: true });
  const results = await Promise.allSettled([1, 2].map(() => listings.reconcileActive(identity, remote, { ...remote, listingId: "123" })));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
});

test("active catalog validates page, workspace and environment before fetching", async () => {
  const { catalog, connections } = await setup();
  await withFetch(async () => { assert.fail("No fetch expected"); }, async () => {
    for (const page of ["1abc", "1.5", "0", "126", ["1", "2"], {}, null, ""]) await assert.rejects(catalog.list("workspace", page), /Page/);
    await assert.rejects(catalog.list("other"), /Connect/);
    await connections.setCredentials("workspace", "ebay", { environment: "production" });
    await assert.rejects(catalog.list("workspace"), /authorize/);
  });
});

test("active catalog validates its public response and returns no credentials", async () => {
  const { catalog } = await setup();
  await withFetch(async (url, init) => {
    assert.equal(String(url), "https://api.sandbox.ebay.com/ws/api.dll");
    assert.match(String(init?.body), /<PageNumber>2<\/PageNumber>/);
    return new Response(emptyCatalog);
  }, async () => {
    const result = ebayActiveListingsPageSchema.parse(await catalog.list("workspace", "2"));
    assert.equal(result.page, 2);
    assert.deepEqual(result.items, []);
    assert(!JSON.stringify(result).includes("secret"));
  });
});

test("active catalog discards results after disconnect or account replacement during eBay read", async () => {
  for (const status of ["connected", "disconnected"] as const) {
    const { connections, catalog } = await setup();
    await withFetch(async () => {
      await connections.upsertConnection("workspace", "ebay", { status, externalAccountId: "replacement", metadata: {} });
      return new Response(emptyCatalog);
    }, async () => { await assert.rejects(catalog.list("workspace"), /connection changed/); });
  }
});
