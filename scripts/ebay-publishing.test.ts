import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEbayAspects, productUpsertInputSchema, validateEbayCategory, validateProductForChannel, type Product } from "@omnilist/shared";
import { createEbayPublishAdapter } from "../apps/api/src/modules/publishing/adapters/ebay-publish.adapter";
import { getEbayCategoryRequirements } from "../apps/api/src/modules/channels/adapters/ebay-category";
import { getEbaySellerSetupOptions } from "../apps/api/src/modules/channels/adapters/ebay-client";
import { createChannelAuthService } from "../apps/api/src/modules/channels/channel-auth.service";
import { createChannelConnectionRepository, type ChannelConnectionRecord } from "../apps/api/src/modules/channels/channel-connections.repository";
import { createPublishingService } from "../apps/api/src/modules/publishing/publishing.service";
import { createPublishJobRepository } from "../apps/api/src/modules/publishing/publishing.repository";
import type { ApiEnv } from "../apps/api/src/config/env";

const env: ApiEnv = {
  nodeEnv: "test", port: 4000, publicApiUrl: "http://localhost:4000", publicWebUrl: "http://localhost:3000",
  ebayClientId: "test-app", ebayClientSecret: "test-secret", ebayRedirectUriName: "test-runame",
  ebayEnvironment: "sandbox", ebayScopes: [], supabaseStorageBucket: "test-images"
};
const product: Product = {
  id: "shirt", title: "Cotton crew neck T-shirt", description: "An accurate description of a single cotton shirt with tags, size M, black, without defects.",
  sku: "SHIRT-1", basePrice: 25, quantity: 1, brand: "Example", attributes: { color: "Black", material: "Cotton" },
  images: [{ id: "photo", url: "https://images.example/shirt.jpg" }], variants: [],
  channelOverrides: { ebay: { categoryId: "15687", condition: "NEW", aspects: { Size: ["M"], Department: ["Men"], "Size Type": ["Regular"] } } }
};
const record: ChannelConnectionRecord = {
  connection: { id: "connection", workspaceId: "workspace", channelId: "ebay", status: "connected", metadata: {
    marketplaceId: "EBAY_US", currency: "USD", merchantLocationKey: "warehouse", fulfillmentPolicyId: "fulfillment", paymentPolicyId: "payment", returnPolicyId: "returns"
  } },
  credentials: { accessToken: "test-user-token", accessTokenExpiresAt: "2099-01-01T00:00:00Z", scope: "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly" }
};

type Call = { path: string; method: string; body: any; headers: Headers };
interface Options { cards?: boolean; parent?: boolean; empty?: boolean; unavailable?: boolean; networkError?: boolean; noListingId?: boolean; live?: boolean; metadataStatus?: number }
async function withEbay(options: Options, run: (calls: Call[]) => Promise<void>) {
  const original = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.sandbox.ebay.com", "Sandbox credentials must never go to production");
    const call = { path: url.pathname + url.search, method: init?.method ?? "GET", body: typeof init?.body === "string" && init.body.startsWith("{") ? JSON.parse(init.body) : init?.body, headers: new Headers(init?.headers) };
    calls.push(call);
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    const categoryId = options.cards ? "261328" : "15687";
    if (url.pathname.includes("/identity/")) return json({ access_token: "test-app-token", expires_in: 7200 });
    if (url.pathname.endsWith("get_default_category_tree_id")) return json({ categoryTreeId: "0" });
    if (url.pathname.endsWith("get_category_subtree")) return json({ categorySubtreeNode: { leafCategoryTreeNode: !options.parent, category: { categoryId, categoryName: options.cards ? "Trading Card Singles" : "Men's T-Shirts" } } });
    if (url.pathname.endsWith("get_item_aspects_for_category")) {
      assert.equal(call.headers.get("authorization"), "Bearer test-app-token");
      return json({ aspects: ["Brand", "Size", "Department", "Size Type"].map(name => ({ localizedAspectName: name, aspectConstraint: { aspectRequired: true, aspectMode: name === "Size" ? "SELECTION_ONLY" : "FREE_TEXT", itemToAspectCardinality: "SINGLE" }, aspectValues: name === "Size" ? [{ localizedValue: "M" }] : [] })) });
    }
    if (url.pathname.endsWith("get_item_condition_policies")) {
      assert.equal(call.headers.get("authorization"), "Bearer test-user-token");
      assert.equal(url.searchParams.get("filter"), `categoryIds:{${categoryId}}`);
      if (options.metadataStatus) return json({ errors: [{ message: "System error." }] }, options.metadataStatus);
      return json({ itemConditionPolicies: options.empty ? [] : [{ categoryId, itemConditions: [{ conditionId: options.cards ? "4000" : "1000", conditionDescription: options.cards ? "Ungraded" : "New with tags", conditionDescriptors: options.cards ? [{}] : [] }] }] });
    }
    if (url.pathname.includes("/inventory_item/")) {
      if (options.networkError) throw new TypeError("fetch failed");
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/offer") && call.method === "GET") return json({ offers: options.live ? [{ offerId: "offer", status: "PUBLISHED", listing: { listingId: "123", listingStatus: "ACTIVE" } }] : [] });
    if (url.pathname.endsWith("/offer") && call.method === "POST") return json({ offerId: "offer" }, 201);
    if (url.pathname.endsWith("/publish")) return options.unavailable ? json({ errors: [{ errorId: 25713, message: "This Offer is not available." }] }, 400) : json(options.noListingId ? {} : { listingId: "123" });
    if (url.pathname.endsWith("/offer/offer")) return call.method === "PUT" ? new Response(null, { status: 204 }) : json({ offerId: "offer", status: "UNPUBLISHED", listing: { listingId: "old", listingStatus: "ENDED" } });
    throw new Error(`Unexpected eBay request: ${call.method} ${call.path}`);
  };
  try { await run(calls); } finally { globalThis.fetch = original; }
}

test("shirt publishes only after metadata validation, with photos and string-array aspects inside product", async () => {
  await withEbay({}, async calls => {
    const result = await createEbayPublishAdapter(env).publish(product, record);
    assert.equal(result.status, "published");
    assert.match(result.message, /123/);
    const inventory = calls.find(call => call.path.includes("inventory_item"))!;
    assert.equal(inventory.body.imageUrls, undefined);
    assert.deepEqual(inventory.body.product.imageUrls, [product.images[0].url]);
    assert.deepEqual(inventory.body.product.aspects.Brand, ["Example"]);
    assert.deepEqual(inventory.body.product.aspects.Size, ["M"]);
    assert.equal(inventory.body.condition, "NEW");
    assert.equal(inventory.headers.get("accept-language"), "en-US");
    assert.equal(inventory.headers.get("content-language"), "en-US");
    assert(calls.findIndex(call => call.path.includes("get_item_condition_policies")) < calls.indexOf(inventory));
  });
});

test("261328 with NEW fails before any inventory or offer write", async () => {
  await withEbay({ cards: true }, async calls => {
    const shirt = structuredClone(product);
    shirt.channelOverrides.ebay!.categoryId = "261328";
    const result = await createEbayPublishAdapter(env).publish(shirt, record);
    assert.equal(result.status, "failed");
    assert.match(result.message, /Trading Card Singles.*261328/);
    assert(!calls.some(call => call.path.includes("/sell/inventory/")));
  });
});

test("grading categories are explicitly unsupported, not silently converted", async () => {
  await withEbay({ cards: true }, async () => {
    const requirements = await getEbayCategoryRequirements(env, "test-user-token", "EBAY_US", "261328");
    assert.equal(requirements.conditions[0].supported, false);
    assert.match(validateEbayCategory(requirements, "USED_VERY_GOOD", {})[0], /grading/);
  });
});

for (const options of [{ parent: true }, { empty: true }, { metadataStatus: 503 }]) {
  test(`unverified category blocks publication: ${JSON.stringify(options)}`, async () => {
    await withEbay(options, async calls => {
      const result = await createEbayPublishAdapter(env).publish(product, record);
      assert.equal(result.status, "failed");
      assert(!calls.some(call => call.path.includes("/sell/inventory/")));
    });
  });
}

test("required and selection-only specifics are checked before writing", async () => {
  await withEbay({}, async calls => {
    const shirt = structuredClone(product);
    shirt.channelOverrides.ebay!.aspects = { Size: ["not-a-size"] };
    const result = await createEbayPublishAdapter(env).publish(shirt, record);
    assert.match(result.message, /Department/);
    assert.match(result.message, /not-a-size/);
    assert(!calls.some(call => call.path.includes("/sell/inventory/")));
  });
});

test("ended listing ID cannot turn unavailable offer failure into success", async () => {
  await withEbay({ unavailable: true }, async () => {
    const result = await createEbayPublishAdapter(env).publish(product, record);
    assert.equal(result.status, "failed");
  });
});

test("existing active listing is updated without creating or publishing another offer", async () => {
  await withEbay({ live: true }, async calls => {
    const result = await createEbayPublishAdapter(env).publish(product, record);
    assert.equal(result.status, "published");
    assert(!calls.some(call => call.method === "POST" && call.path.includes("/offer")));
  });
});

test("HTTP success without a listing ID is not published success", async () => {
  await withEbay({ noListingId: true }, async () => {
    assert.equal((await createEbayPublishAdapter(env).publish(product, record)).status, "failed");
  });
});

test("override specifics survive schema parsing and are normalized to arrays", () => {
  const parsed = productUpsertInputSchema.parse(product);
  assert.deepEqual(parsed.channelOverrides.ebay?.aspects?.Size, ["M"]);
  assert.equal(parsed.channelOverrides.ebay?.condition, "NEW");
  const shirt = structuredClone(product);
  shirt.channelOverrides.ebay!.aspects!.Brand = ["  Another brand  "];
  assert.deepEqual(buildEbayAspects(shirt).Brand, ["Another brand"]);
});

test("readiness rejects zero stock, missing condition, non-HTTPS photos and long titles", () => {
  const shirt = structuredClone(product);
  shirt.quantity = 0;
  shirt.title = "x".repeat(81);
  shirt.images[0].url = "data:image/jpeg;base64,AA==";
  delete shirt.channelOverrides.ebay!.condition;
  const readiness = validateProductForChannel(shirt, "ebay");
  assert.equal(readiness.status, "needs_attention");
  for (const field of ["quantity", "title", "images", "condition"]) assert(readiness.issues.some(issue => issue.field === field && issue.severity === "blocking"));
  assert.equal(validateProductForChannel(product, "ebay").status, "ready", "internal category is not an eBay category");
});

test("unsigned OAuth cookie cannot choose a victim workspace", async () => {
  const repository = createChannelConnectionRepository();
  const auth = createChannelAuthService(repository, env);
  await assert.rejects(auth.completeConnection({ channelId: "ebay", code: "test-code", returnedState: "forged", stateCookieValue: Buffer.from(JSON.stringify({ workspaceId: "victim", channelId: "ebay", state: "forged" })).toString("base64url") }), /INVALID_CHANNEL_CONNECT_STATE/);
  const unchanged = await repository.getConnectionRecord("victim", "ebay");
  assert.equal(unchanged?.connection.status, "disconnected");
  assert.deepEqual(unchanged?.credentials, {});
});

test("system errors during setup are errors, never successful empty policy lists", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ errors: [{ message: "System error." }] }), { status: 500 });
  try { await assert.rejects(getEbaySellerSetupOptions(env, record.credentials, "EBAY_US"), /HTTP 500/); }
  finally { globalThis.fetch = original; }
});

for (const channelId of ["ebay", "shopify"] as const) {
  test(`job terminates on ${channelId === "ebay" ? "transport exception" : "unsupported channel"}`, async () => {
    await withEbay({ networkError: true }, async () => {
      const jobs = createPublishJobRepository();
      const connections = createChannelConnectionRepository();
      const service = createPublishingService(jobs, connections, env);
      const connection = { ...record, connection: { ...record.connection, channelId } };
      const job = await service.enqueuePublishJob({ workspaceId: "workspace", product, channelIds: [channelId], connections: [connection.connection], connectionRecords: [connection] });
      let final = await jobs.getJob("workspace", job.id);
      for (let i = 0; i < 100 && ["queued", "processing"].includes(final!.status); i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
        final = await jobs.getJob("workspace", job.id);
      }
      assert.equal(final?.status, "failed");
      assert.equal(final?.targets[0].status, "failed");
    });
  });
}
