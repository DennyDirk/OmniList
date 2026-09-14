import { test } from "node:test";
import assert from "node:assert/strict";
import type { Product, EbayCategoryRequirements } from "@omnilist/shared";
import { assessmentSchema, canPublishAssessment } from "@omnilist/shared";
import type { ApiEnv } from "../apps/api/src/config/env";
import { UnifiedAssessmentService } from "../apps/api/src/modules/validation/assessment.service";
import { createChannelConnectionRepository } from "../apps/api/src/modules/channels/channel-connections.repository";
import { getEbayOfferStatus } from "../apps/api/src/modules/channels/adapters/ebay-listing-status";

const env: ApiEnv = { nodeEnv: "test", port: 4000, publicApiUrl: "http://localhost:4000", publicWebUrl: "http://localhost:3000",
  ebayEnvironment: "sandbox", ebayScopes: [], supabaseStorageBucket: "images", ebayClientId: "test", ebayClientSecret: "test", ebayRedirectUriName: "test" };
const product: Product = { id: "p", title: "Cotton shirt", description: "A cotton shirt.", sku: "SKU", basePrice: 20, currency: "USD", quantity: 1,
  images: [{ id: "i", url: "https://example.com/i.jpg" }], attributes: {}, variants: [],
  channelOverrides: { ebay: { categoryId: "15687", condition: "NEW" } } };
const requirements: EbayCategoryRequirements = { categoryId: "15687", categoryName: "Shirts", marketplaceId: "EBAY_US",
  conditions: [{ value: "NEW", label: "New", supported: true }], aspects: [] };
async function setup() {
  const repo = createChannelConnectionRepository();
  await repo.upsertConnection("w", "ebay", { status: "connected", metadata: {
    merchantLocationKey: "loc", fulfillmentPolicyId: "f", paymentPolicyId: "p", returnPolicyId: "r"
  } });
  await repo.setCredentials("w", "ebay", { accessToken: "old", refreshToken: "refresh", environment: "sandbox" });
  const record = structuredClone((await repo.getConnectionRecord("w", "ebay"))!);
  const remote = {
    authorize: async () => ({ accessToken: "new", credentials: { ...record.credentials, accessToken: "new" } }),
    requirements: async () => requirements
  };
  return { repo, record, remote, service: new UnifiedAssessmentService(env, repo, remote) };
}

test("assessment refuses ready when the provider or authorization is unavailable", async () => {
  for (const failure of ["authorize", "requirements"] as const) {
    const { repo, record, remote } = await setup();
    const service = new UnifiedAssessmentService(env, repo, { ...remote, [failure]: async () => { throw Error("secret failure"); } });
    const result = await service.assessProduct(product, "ebay", record);
    assert.equal(result.status, "not_checked");
    assert(result.issues.some(issue => issue.severity === "blocking"));
    assert(!JSON.stringify(result).includes("secret failure"));
  }
});

test("assessment rejects unsupported channels and incomplete seller setup before network calls", async () => {
  const { repo, record, remote } = await setup();
  const service = new UnifiedAssessmentService(env, repo, { ...remote, authorize: async () => { assert.fail("Unexpected remote call"); } });
  for (const channel of ["etsy", "shopify"] as const) assert.equal((await service.assessProduct(product, channel)).status, "not_supported");
  assert.equal((await service.assessProduct(product, "ebay")).status, "needs_attention");
  assert.equal((await service.assessProduct(product, "ebay", { ...record, connection: { ...record.connection, metadata: {} } })).status, "needs_attention");
  assert.equal((await service.assessProduct(product, "ebay", { ...record, credentials: { ...record.credentials, environment: "production" } })).status, "needs_attention");
});

test("assessment allows suggestions, persists refreshed credentials and binds its revision to product data", async () => {
  const { service, repo, record } = await setup();
  const result = await service.assessProduct(product, "ebay", record);
  assert.equal(result.status, "ready");
  assert(result.issues.some(issue => issue.severity !== "blocking"));
  assert.equal((await repo.getConnectionRecord("w", "ebay"))?.credentials.accessToken, "new");
  const changed = await service.assessProduct({ ...product, basePrice: 30 }, "ebay", (await repo.getConnectionRecord("w", "ebay"))!);
  assert.notEqual(result.revision, changed.revision);
  assert(!JSON.stringify(result).includes("accessToken"));
});

test("assessment retains invalid condition as an actionable blocking issue", async () => {
  const { service, record } = await setup();
  const result = await service.assessProduct({ ...product, channelOverrides: { ebay: { categoryId: "15687", condition: "USED" } } }, "ebay", record);
  assert.equal(result.status, "needs_attention");
  assert(result.issues.some(issue => issue.code === "ebay_category_requirement"));
});

test("assessment discards results when a seller reconnects during verification", async () => {
  const { repo, record, remote } = await setup();
  const service = new UnifiedAssessmentService(env, repo, { ...remote, requirements: async () => {
    await repo.setCredentials("w", "ebay", { accessToken: "replacement", refreshToken: "other" });
    return requirements;
  } });
  assert.equal((await service.assessProduct(product, "ebay", record)).status, "not_checked");
  assert.equal((await repo.getConnectionRecord("w", "ebay"))?.credentials.accessToken, "replacement");
});

test("offer checks reject malformed and mismatched responses", async () => {
  const original = globalThis.fetch;
  const offer = { offerId: "1", sku: "SKU", marketplaceId: "EBAY_US", status: "PUBLISHED", listing: { listingId: "123" } };
  try {
    for (const body of [{}, { ...offer, offerId: "2" }, { ...offer, marketplaceId: "EBAY_GB" }]) {
      globalThis.fetch = async () => Response.json(body);
      await assert.rejects(getEbayOfferStatus(env, "token", "1", "EBAY_US"), /mismatched/);
    }
    globalThis.fetch = async () => Response.json(offer);
    assert.equal((await getEbayOfferStatus(env, "token", "1", "EBAY_US")).listingId, "123");
  } finally { globalThis.fetch = original; }
});

test("publish eligibility rejects unverified and inconsistent server assessments", async () => {
  const { service, record } = await setup();
  const ready = assessmentSchema.parse(await service.assessProduct(product, "ebay", record));
  assert.equal(canPublishAssessment(ready), true);
  for (const status of ["not_checked", "not_supported", "needs_attention"] as const) {
    assert.equal(canPublishAssessment({ ...ready, status }), false);
  }
  assert.equal(canPublishAssessment({ ...ready, issues: [{ code: "test", field: "condition", severity: "blocking", message: "Choose condition" }] }), false);
  assert.equal(assessmentSchema.safeParse({ status: "ready" }).success, false);
});
