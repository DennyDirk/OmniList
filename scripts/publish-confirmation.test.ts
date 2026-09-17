import { test } from "node:test";
import assert from "node:assert/strict";
import { bulkPublishJobRequestSchema, publishJobRequestSchema, productUpsertInputSchema, canPublishAssessment } from "@omnilist/shared";
import { assertConfirmedConnections, confirmBulkProducts } from "../apps/api/src/modules/publishing/publish-confirmation";
import { connectionRevision } from "../apps/api/src/modules/publishing/connection-revision";
import { withProductRevision } from "../apps/api/src/modules/catalog/product-revision";
import { createPublishJobRepository } from "../apps/api/src/modules/publishing/publishing.repository";
import { createPublishingService } from "../apps/api/src/modules/publishing/publishing.service";
import { createChannelConnectionRepository, type ChannelConnectionRecord } from "../apps/api/src/modules/channels/channel-connections.repository";
import { readPublishAssessment, PublishReviewError } from "../apps/web/lib/publish-review";
import type { ApiEnv } from "../apps/api/src/config/env";

const env: ApiEnv = { nodeEnv: "test", port: 4000, publicApiUrl: "http://localhost:4000", publicWebUrl: "http://localhost:3000",
  ebayEnvironment: "sandbox", ebayScopes: [], supabaseStorageBucket: "images" };
const product = withProductRevision({ id: "shirt", ...productUpsertInputSchema.parse({
  title: "Cotton shirt", description: "A plain test shirt.", sku: "SHIRT", basePrice: 25, quantity: 1,
  images: [], attributes: {}, variants: [], channelOverrides: {}
}) });
const record: ChannelConnectionRecord = { connection: { id: "store", workspaceId: "w", channelId: "ebay", status: "connected",
  externalAccountId: "seller", metadata: { environment: "sandbox", marketplaceId: "EBAY_US", connectedAt: "now" } },
  credentials: { accessToken: "secret-token", refreshToken: "secret-refresh", environment: "sandbox" } };
const hash = connectionRevision(record, "sandbox");
const confirmation = { products: [{ productId: product.id, productRevision: product.revision! }],
  channels: ["ebay"], connectionRevisions: { ebay: hash } };

test("publish contracts require reviewed product and store versions, bounded unique bulk selection", () => {
  assert(bulkPublishJobRequestSchema.safeParse(confirmation).success);
  assert(publishJobRequestSchema.safeParse({ productRevision: product.revision, channels: ["ebay"], connectionRevisions: { ebay: hash } }).success);
  for (const payload of [
    { productIds: [product.id], channels: ["ebay"] },
    { ...confirmation, products: [] },
    { ...confirmation, products: [...confirmation.products, ...confirmation.products] },
    { ...confirmation, products: Array.from({ length: 21 }, (_, n) => ({ productId: String(n), productRevision: product.revision })) },
    { ...confirmation, connectionRevisions: {} },
    { ...confirmation, connectionRevisions: { ebay: "invalid" } },
    { ...confirmation, channels: ["ebay", "etsy"] }
  ]) assert.equal(bulkPublishJobRequestSchema.safeParse(payload).success, false);
  assert.equal(publishJobRequestSchema.safeParse({ channels: ["ebay"], productRevision: product.revision }).success, false);
});

test("bulk confirmation validates the entire selection before returning any queueable snapshot", async () => {
  const other = withProductRevision({ ...product, id: "other", sku: "OTHER" });
  const selections = [...confirmation.products, { productId: other.id, productRevision: other.revision! }];
  for (const unavailable of [undefined, withProductRevision({ ...other, quantity: 0 })]) {
    let queued = 0;
    await assert.rejects(async () => {
      const snapshots = await confirmBulkProducts(selections, async id => id === product.id ? product : unavailable);
      queued += snapshots.length;
    }, /changed or is no longer available/);
    assert.equal(queued, 0);
  }
  const snapshots = await confirmBulkProducts(selections, async id => id === product.id ? product : other);
  snapshots[0].title = "Changed only in caller";
  assert.equal(product.title, "Cotton shirt");
  assert.equal(snapshots[1].revision, other.revision);
});

test("confirmation rejects seller, setup, environment and workspace changes but allows token rotation", () => {
  for (const changed of [
    { ...record, connection: { ...record.connection, id: "another" } },
    { ...record, connection: { ...record.connection, externalAccountId: "new-seller" } },
    { ...record, connection: { ...record.connection, workspaceId: "foreign" } },
    { ...record, connection: { ...record.connection, status: "disconnected" as const } },
    { ...record, connection: { ...record.connection, metadata: { ...record.connection.metadata, returnPolicyId: "new" } } },
    { ...record, connection: { ...record.connection, metadata: { ...record.connection.metadata, connectedAt: "later" } } },
    { ...record, credentials: { ...record.credentials, environment: "production" } }
  ]) assert.throws(() => assertConfirmedConnections("w", ["ebay"], { ebay: hash }, [changed], "sandbox"), /store or its settings changed/);
  assert.throws(() => assertConfirmedConnections("w", ["ebay"], {}, [record], "sandbox"));
  assert.throws(() => assertConfirmedConnections("w", ["ebay"], { ebay: hash }, [], "sandbox"));
  assert.doesNotThrow(() => assertConfirmedConnections("w", ["ebay"], { ebay: hash }, [
    { ...record, credentials: { ...record.credentials, accessToken: "rotated" } }
  ], "sandbox"));
});

test("enqueue rejects stale store confirmation before persisting a job or contacting eBay", async () => {
  const jobs = createPublishJobRepository();
  const service = createPublishingService(jobs, createChannelConnectionRepository(), env);
  await assert.rejects(service.enqueuePublishJob({ workspaceId: "w", product, expectedRevision: product.revision,
    expectedConnectionRevisions: { ebay: "0".repeat(64) }, channelIds: ["ebay"], connections: [record.connection], connectionRecords: [record] }), /store or its settings changed/);
  assert.deepEqual(await jobs.listJobs("w"), []);
  await service.stopWorker();
});

function readyResponse() {
  return { productId: product.id, productRevision: product.revision, connections: [record.connection], items: [{
    productId: product.id, channelId: "ebay", connectionId: record.connection.id, connectionRevision: hash,
    status: "ready", score: 72, issues: [{ code: "description", field: "description", severity: "warning", message: "Optional detail" }],
    checkedAt: new Date().toISOString(), revision: "assessment-revision"
  }] };
}

test("single and bulk review use server assessments, allow recommendations and expose no tokens", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.match(String(input), /products\/shirt\/readiness\?channels=ebay/);
    assert.equal(init?.cache, "no-store");
    assert.equal(init?.credentials, "include");
    return Response.json(readyResponse());
  };
  try {
    const result = await readPublishAssessment("http://localhost:4000", product, record.connection);
    assert.equal(canPublishAssessment(result), true);
    assert.equal(result.connectionRevision, hash);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  } finally { globalThis.fetch = original; }
});

test("review rejects stale product or store, wrong identities, missing hashes and malformed responses", async () => {
  const original = globalThis.fetch;
  const valid = readyResponse();
  const stale = (error: unknown) => error instanceof PublishReviewError && error.reason === "stale";
  try {
    for (const body of [
      { ...valid, productRevision: "0".repeat(64) },
      { ...valid, connections: [{ ...record.connection, externalAccountId: "other-seller" }] },
      { ...valid, connections: [{ ...record.connection, metadata: { ...record.connection.metadata, environment: "production" } }] }
    ]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(readPublishAssessment("/api/proxy", product, record.connection), stale);
    }
    for (const body of [
      {}, { ...valid, productId: "foreign" }, { ...valid, items: [] }, { ...valid, items: [...valid.items, ...valid.items] },
      { ...valid, items: [{ ...valid.items[0], connectionId: "other-store" }] },
      { ...valid, items: [{ ...valid.items[0], productId: "other-product" }] },
      { ...valid, items: [{ ...valid.items[0], channelId: "etsy" }] },
      { ...valid, items: [{ ...valid.items[0], connectionRevision: undefined }] }
    ]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(readPublishAssessment("/api/proxy", product, record.connection), PublishReviewError);
    }
    globalThis.fetch = async () => new Response("", { status: 502 });
    await assert.rejects(readPublishAssessment("/api/proxy", product, record.connection), PublishReviewError);
    globalThis.fetch = async () => Response.json(valid);
    await assert.rejects(readPublishAssessment("/api/proxy", product, record.connection, AbortSignal.abort()), PublishReviewError);
    for (const status of ["not_checked", "needs_attention", "not_supported"]) {
      globalThis.fetch = async () => Response.json({ ...valid, items: [{ ...valid.items[0], status }] });
      assert.equal(canPublishAssessment(await readPublishAssessment("/api/proxy", product, record.connection)), false);
    }
  } finally { globalThis.fetch = original; }
});
