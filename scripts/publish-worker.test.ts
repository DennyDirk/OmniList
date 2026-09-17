import { test } from "node:test";
import assert from "node:assert/strict";
import { productUpsertInputSchema } from "@omnilist/shared";
import { createPublishJobRepository, PUBLISH_LEASE_MS } from "../apps/api/src/modules/publishing/publishing.repository";
import { createChannelListingRepository } from "../apps/api/src/modules/publishing/channel-listings.repository";
import { createPublishingService } from "../apps/api/src/modules/publishing/publishing.service";
import { createChannelConnectionRepository } from "../apps/api/src/modules/channels/channel-connections.repository";
import { connectionRevision } from "../apps/api/src/modules/publishing/connection-revision";
import type { ChannelPublishCheckpoint } from "../apps/api/src/modules/publishing/adapters/channel-publish.contract";
import type { ApiEnv } from "../apps/api/src/config/env";

const env: ApiEnv = { nodeEnv: "test", port: 4000, publicApiUrl: "http://localhost:4000", publicWebUrl: "http://localhost:3000",
  ebayEnvironment: "sandbox", ebayScopes: [], supabaseStorageBucket: "images" };
const product = { id: "shirt", ...productUpsertInputSchema.parse({ title: "Test shirt", description: "Cotton shirt for testing.",
  sku: "SHIRT", basePrice: 25, quantity: 1, images: [], attributes: {}, variants: [], channelOverrides: {} }) };
const remote = { channelId: "ebay" as const, environment: "sandbox" as const, marketplaceId: "EBAY_US", sku: "SHIRT", offerId: "offer" };

async function setup(stage?: ChannelPublishCheckpoint["stage"]) {
  let time = 1_000;
  const jobs = createPublishJobRepository(undefined, () => time);
  const listings = createChannelListingRepository();
  const connections = createChannelConnectionRepository();
  const connection = await connections.upsertConnection("workspace", "ebay", { status: "connected", externalAccountId: "seller", metadata: {} });
  await connections.setCredentials("workspace", "ebay", { accessToken: "secret", refreshToken: "refresh", environment: "sandbox", accessTokenExpiresAt: "2099-01-01" });
  const record = (await connections.getConnectionRecordById("workspace", connection.id))!;
  const job = await jobs.createJob({ workspaceId: "workspace", productId: product.id, productTitle: product.title, productSnapshot: product,
    connectionRevisions: { target: connectionRevision(record, "sandbox") }, status: "queued", targets: [{ id: "target",
      channelId: "ebay", channelName: "eBay", status: "queued", readinessScore: 100, issueCount: 0, connectionId: connection.id }] });
  const claimed = (await jobs.claimJob("workspace", job.id))!;
  const identity = { workspaceId: "workspace", productId: product.id, connectionId: connection.id, channelId: "ebay" as const,
    environment: "sandbox", marketplaceId: "EBAY_US", sku: product.sku, externalAccountId: "seller" };
  await listings.claim(identity, "revision", claimed.executionId);
  if (stage) await listings.recordCheckpoint(identity, "revision", { stage,
    ...(["offer_saved", "publish_requested"].includes(stage) ? { remoteListing: remote } : {}) }, claimed.executionId);
  const service = () => createPublishingService(jobs, connections, env, listings);
  return { jobs, listings, connections, identity, job, claimed, service, expire: () => { time += PUBLISH_LEASE_MS + 1; } };
}

async function onlyOfferReads(data: unknown, run: (calls: string[]) => Promise<void>) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.method, "GET", "Recovery must never write to eBay");
    assert.equal(String(url), "https://api.sandbox.ebay.com/sell/inventory/v1/offer/offer");
    calls.push(String(url));
    return Response.json(data);
  };
  try { await run(calls); } finally { globalThis.fetch = original; }
}

test("a live lease cannot be recovered; renewal and workspace isolation are enforced", async () => {
  const f = await setup("publish_requested");
  assert.deepEqual(await f.jobs.listRunnableJobs(), []);
  assert.equal(await f.jobs.claimRecovery("workspace", f.job.id), undefined);
  assert.equal(await f.jobs.renewExecution("foreign", f.job.id, f.claimed.executionId!), false);
  assert.equal(await f.jobs.renewExecution("workspace", f.job.id, "wrong"), false);
  assert.equal(await f.jobs.renewExecution("workspace", f.job.id, f.claimed.executionId!), true);
  f.expire();
  assert.equal(await f.jobs.renewExecution("workspace", f.job.id, f.claimed.executionId!), false);
  const results = await Promise.all([1, 2].map(() => f.jobs.claimRecovery("workspace", f.job.id)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.find(Boolean)?.recoveryOf, f.claimed.executionId);
  await assert.rejects(f.jobs.updateJob("workspace", f.job.id, "completed", [], f.claimed.executionId), /execution changed/);
  f.expire();
  const again = await f.jobs.claimRecovery("workspace", f.job.id);
  assert.equal(again?.recoveryOf, f.claimed.executionId, "Repeated recovery retains the ORIGINAL attempt, not the recovery worker");
});

test("restart restores a saved successful outcome without any external call", async () => {
  const f = await setup("publish_requested");
  await f.listings.recordResult(f.identity, { status: "published", revision: "revision", executionId: f.claimed.executionId,
    remoteListing: { ...remote, listingId: "123" } });
  f.expire();
  await onlyOfferReads({}, async calls => {
    await Promise.all([f.service().resumePendingJobs(), f.service().resumePendingJobs()]);
    const restored = await f.jobs.getJob("workspace", f.job.id);
    assert.equal(restored?.status, "completed");
    assert.equal(restored?.targets[0].remoteListing?.channelId === "ebay" && restored.targets[0].remoteListing.listingId, "123");
    assert.equal(calls.length, 0);
  });
});

test("lost publish response is reconciled by exact saved offer, without replay", async () => {
  const f = await setup("publish_requested");
  f.expire();
  await onlyOfferReads({ offerId: "offer", sku: "SHIRT", marketplaceId: "EBAY_US", status: "PUBLISHED",
    listing: { listingId: "123", listingStatus: "ACTIVE" } }, async calls => {
    await f.service().resumePendingJobs();
    assert.equal((await f.jobs.getJob("workspace", f.job.id))?.status, "completed");
    assert.equal((await f.listings.get(f.identity))?.appliedRevision, null);
    assert.equal(calls.length, 1);
  });
});

test("an in-flight publish cannot become retryable just because one read says UNPUBLISHED", async () => {
  const f = await setup("publish_requested");
  f.expire();
  await onlyOfferReads({ offerId: "offer", sku: "SHIRT", marketplaceId: "EBAY_US", status: "UNPUBLISHED" }, async () => {
    await f.service().resumePendingJobs();
    assert.equal((await f.jobs.getJob("workspace", f.job.id))?.status, "failed");
    assert.equal((await f.listings.get(f.identity))?.status, "needs_review");
    await assert.rejects(f.listings.claim(f.identity, "new"), /requires verification/);
  });
});

test("lost create/update response stays blocked; no SKU lookup or blind replay", async () => {
  for (const stage of ["inventory_write_requested", "offer_write_requested"] as const) {
    const f = await setup(stage);
    f.expire();
    await onlyOfferReads({}, async calls => {
      await f.service().resumePendingJobs();
      assert.equal((await f.jobs.getJob("workspace", f.job.id))?.status, "failed");
      assert.equal((await f.listings.get(f.identity))?.status, "needs_review");
      assert.equal(calls.length, 0);
      await assert.rejects(f.listings.recordCheckpoint(f.identity, "revision", { stage: "inventory_written" }, f.claimed.executionId), /attempt changed/);
    });
  }
});

test("a stopped attempt before any write can be retried but a stale executor stays fenced", async () => {
  const f = await setup();
  f.expire();
  await f.service().resumePendingJobs();
  assert.equal((await f.jobs.getJob("workspace", f.job.id))?.status, "failed");
  assert.equal((await f.listings.get(f.identity))?.status, "failed");
  await f.listings.claim(f.identity, "revision", "new-execution");
  await assert.rejects(f.listings.recordCheckpoint(f.identity, "revision", { stage: "inventory_write_requested" }, f.claimed.executionId), /attempt changed/);
  await assert.rejects(f.listings.recordResult(f.identity, { status: "failed", revision: "revision", executionId: f.claimed.executionId }), /attempt changed/);
});

test("connection revisions ignore rotating tokens but detect account, settings and environment changes", () => {
  const record = { connection: { id: "c", workspaceId: "w", channelId: "ebay" as const, status: "connected" as const,
    externalAccountId: "seller", metadata: { connectedAt: "now", marketplaceId: "EBAY_US" } }, credentials: { accessToken: "secret" } };
  const revision = connectionRevision(record, "sandbox");
  assert.equal(revision, connectionRevision({ ...record, credentials: { accessToken: "rotated" } }, "sandbox"));
  assert.notEqual(revision, connectionRevision(record, "production"));
  assert.notEqual(revision, connectionRevision({ ...record, connection: { ...record.connection, externalAccountId: "other" } }, "sandbox"));
  assert.notEqual(revision, connectionRevision({ ...record, connection: { ...record.connection, metadata: { ...record.connection.metadata, connectedAt: "later" } } }, "sandbox"));
});

test("a late recovery response cannot unlock a newer attempt for the same offer and payload", async () => {
  const f = await setup("offer_saved");
  const [old] = await f.listings.interruptExecution("workspace", f.claimed.executionId!);
  await f.listings.markRetryable(f.identity, remote, old);
  await f.listings.claim(f.identity, "revision", "new-owner");
  await f.listings.recordResult(f.identity, { status: "failed", revision: "revision", executionId: "new-owner",
    remoteListing: remote, requiresReconciliation: true });
  await assert.rejects(f.listings.reconcileActive(f.identity, remote, { ...remote, listingId: "123" }, old), /listing changed/);
  await assert.rejects(f.listings.markRetryable(f.identity, remote, old), /listing changed/);
  assert.equal((await f.listings.get(f.identity))?.status, "needs_review");
});
