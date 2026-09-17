import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEbayAspects, productUpsertInputSchema, validateEbayCategory, validateProductForChannel, type Product } from "@omnilist/shared";
import { createEbayPublishAdapter } from "../apps/api/src/modules/publishing/adapters/ebay-publish.adapter";
import { getEbayCategoryRequirements } from "../apps/api/src/modules/channels/adapters/ebay-category";
import { getEbaySellerSetupOptions } from "../apps/api/src/modules/channels/adapters/ebay-client";
import { createChannelAuthService } from "../apps/api/src/modules/channels/channel-auth.service";
import { createChannelConnectionRepository, type ChannelConnectionRecord } from "../apps/api/src/modules/channels/channel-connections.repository";
import { buildPublishPreview, createPublishingService } from "../apps/api/src/modules/publishing/publishing.service";
import { createPublishJobRepository, PUBLISH_LEASE_MS } from "../apps/api/src/modules/publishing/publishing.repository";
import { connectionRevision } from "../apps/api/src/modules/publishing/connection-revision";
import { createChannelListingRepository } from "../apps/api/src/modules/publishing/channel-listings.repository";
import type { ApiEnv } from "../apps/api/src/config/env";
import { withProductRevision } from "../apps/api/src/modules/catalog/product-revision";
import { publishJobRequestSchema } from "@omnilist/shared";

const env: ApiEnv = {
  nodeEnv: "test", port: 4000, publicApiUrl: "http://localhost:4000", publicWebUrl: "http://localhost:3000",
  ebayClientId: "test-app", ebayClientSecret: "test-secret", ebayRedirectUriName: "test-runame",
  ebayEnvironment: "sandbox", ebayScopes: [], supabaseStorageBucket: "test-images"
};
const product: Product = {
  id: "shirt", title: "Cotton crew neck T-shirt", description: "An accurate description of a single cotton shirt with tags, size M, black, without defects.",
  sku: "SHIRT-1", basePrice: 25, currency: "USD", quantity: 1, brand: "Example", attributes: { color: "Black", material: "Cotton" },
  images: [{ id: "photo", url: "https://images.example/shirt.jpg" }], variants: [],
  channelOverrides: { ebay: { categoryId: "15687", condition: "NEW", aspects: { Size: ["M"], Department: ["Men"], "Size Type": ["Regular"] } } }
};
const record: ChannelConnectionRecord = {
  connection: { id: "connection", workspaceId: "workspace", channelId: "ebay", status: "connected", metadata: {
    marketplaceId: "EBAY_US", currency: "USD", merchantLocationKey: "warehouse", fulfillmentPolicyId: "fulfillment", paymentPolicyId: "payment", returnPolicyId: "returns"
  } },
  credentials: { accessToken: "test-user-token", accessTokenExpiresAt: "2099-01-01T00:00:00Z", scope: "https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly" }
};

const savedReference = { channelId: "ebay" as const, environment: "sandbox" as const,
  marketplaceId: "EBAY_US", sku: "SHIRT-1", offerId: "offer", listingId: "123" };
function connectedRepository() {
  const repository = createChannelConnectionRepository();
  repository.getConnectionRecordById = async (workspaceId, connectionId) =>
    workspaceId === record.connection.workspaceId && connectionId === record.connection.id ? structuredClone(record) : undefined;
  return repository;
}

type Call = { path: string; method: string; body: any; headers: Headers };
interface Options { cards?: boolean; parent?: boolean; empty?: boolean; unavailable?: boolean; networkError?: boolean; publishNetworkError?: boolean; noListingId?: boolean; live?: boolean; wrongSku?: boolean; ended?: boolean; missingOffer?: boolean; updateUnavailable?: boolean; createNetworkError?: boolean; metadataStatus?: number }
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
    if (url.pathname === "/sell/inventory/v1/offer" && call.method === "GET") return json({ offers: options.live ? [{ offerId: "offer", status: "PUBLISHED", listing: { listingId: "123", listingStatus: "ACTIVE" } }] : [] });
    if (url.pathname === "/sell/inventory/v1/offer" && call.method === "POST") { if (options.createNetworkError) throw new TypeError("lost create response"); return json({ offerId: "offer" }, 201); }
    if (url.pathname.endsWith("/publish")) {
      if (options.publishNetworkError) throw new TypeError("fetch failed after sending publish");
      return options.unavailable ? json({ errors: [{ errorId: 25713, message: "This Offer is not available." }] }, 400) : json(options.noListingId ? {} : { listingId: "123" });
    }
    if (url.pathname.endsWith("/offer/offer")) {
      if (options.missingOffer || (call.method === "PUT" && options.updateUnavailable)) return json({ errors: [{ errorId: 25713, message: "This Offer is not available." }] }, 400);
      if (call.method === "PUT") return new Response(null, { status: 204 });
      return json({ offerId: "offer", sku: options.wrongSku ? "OTHER" : "SHIRT-1", marketplaceId: "EBAY_US", format: "FIXED_PRICE",
        status: options.live ? "PUBLISHED" : "UNPUBLISHED", listing: { listingId: options.live ? "123" : "old", listingStatus: options.live && !options.ended ? "ACTIVE" : "ENDED" } });
    }
    throw new Error(`Unexpected eBay request: ${call.method} ${call.path}`);
  };
  try { await run(calls); } finally { globalThis.fetch = original; }
}

test("a new process resumes queued snapshots once, never legacy contextless jobs", async () => {
  await withEbay({}, async calls => {
    const jobs = createPublishJobRepository();
    const listings = createChannelListingRepository();
    const targets = [{ id: "queued-target", channelId: "ebay" as const, channelName: "eBay", connectionId: record.connection.id,
      status: "queued" as const, readinessScore: 100, issueCount: 0 }];
    const input = { workspaceId: "workspace", productId: product.id, productTitle: product.title, productSnapshot: product,
      status: "queued" as const, targets };
    const legacy = await jobs.createJob(input);
    const queued = await jobs.createJob({ ...input, connectionRevisions: { "queued-target": connectionRevision(record, "sandbox") } });
    const first = createPublishingService(jobs, connectedRepository(), env, listings);
    const second = createPublishingService(jobs, connectedRepository(), env, listings);
    await Promise.all([first.resumePendingJobs(), second.resumePendingJobs()]);
    assert.equal((await jobs.getJob("workspace", legacy.id))?.status, "queued");
    assert.equal((await jobs.getJob("workspace", queued.id))?.status, "completed");
    assert.equal(calls.filter(call => call.method === "POST" && call.path === "/sell/inventory/v1/offer").length, 1);
  });
});

test("queued work never follows a replaced connection or changed seller setup", async () => {
  await withEbay({}, async calls => {
    const jobs = createPublishJobRepository();
    const job = await jobs.createJob({ workspaceId: "workspace", productId: product.id, productTitle: product.title,
      productSnapshot: product, status: "queued", connectionRevisions: { target: "previous-connection-revision" },
      targets: [{ id: "target", channelId: "ebay", channelName: "eBay", connectionId: record.connection.id,
        status: "queued", readinessScore: 100, issueCount: 0 }] });
    await createPublishingService(jobs, connectedRepository(), env).resumePendingJobs();
    assert.equal((await jobs.getJob("workspace", job.id))?.status, "failed");
    assert.match((await jobs.getJob("workspace", job.id))!.targets[0].message!, /changed after confirmation/);
    assert.equal(calls.length, 0);
  });
});

test("an old worker returning after lease loss cannot create an offer or overwrite recovery", async () => {
  await withEbay({}, async calls => {
    let time = 1000;
    const jobs = createPublishJobRepository(undefined, () => time);
    const listings = createChannelListingRepository();
    const service = createPublishingService(jobs, connectedRepository(), env, listings);
    let release!: () => void, entered!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const fetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).includes("/inventory_item/") && init?.method === "PUT") { entered(); await blocked; }
      return fetch(url, init);
    };
    try {
      const job = await service.enqueuePublishJob({ workspaceId: "workspace", product, channelIds: ["ebay"], connections: [record.connection], connectionRecords: [record] });
      await started;
      time += PUBLISH_LEASE_MS + 1;
      await createPublishingService(jobs, connectedRepository(), env, listings).resumePendingJobs();
      const recovered = await jobs.getJob("workspace", job.id);
      assert.equal(recovered?.status, "failed");
      release();
      await service.resumePendingJobs();
      assert.deepEqual(await jobs.getJob("workspace", job.id), recovered);
      assert(!calls.some(call => call.method === "POST" && call.path === "/sell/inventory/v1/offer"));
    } finally { release(); globalThis.fetch = fetch; }
  });
});

test("single publish requires a revision and rejects an outdated preview before queuing", async () => {
  assert.equal(publishJobRequestSchema.safeParse({ channels: ["ebay"] }).success, false);
  assert.equal(publishJobRequestSchema.safeParse({ productRevision: "old", channels: ["ebay"] }).success, false);
  await withEbay({}, async calls => {
    const jobs = createPublishJobRepository();
    const service = createPublishingService(jobs, connectedRepository(), env);
    const previous = withProductRevision(product);
    const changed = withProductRevision({ ...product, basePrice: 30 });
    await assert.rejects(service.enqueuePublishJob({ workspaceId: "workspace", product: changed,
      expectedRevision: previous.revision, channelIds: ["ebay"], connections: [record.connection], connectionRecords: [record] }), /changed after preview/);
    assert.deepEqual(await jobs.listJobs("workspace"), []);
    assert.equal(calls.length, 0);
  });
});

test("a missing persisted snapshot fails the job before any eBay request", async () => {
  await withEbay({}, async calls => {
    const jobs = createPublishJobRepository();
    jobs.getJobProduct = async () => undefined;
    const service = createPublishingService(jobs, connectedRepository(), env);
    const job = await service.enqueuePublishJob({ workspaceId: "workspace", product,
      channelIds: ["ebay"], connections: [record.connection], connectionRecords: [record] });
    let final = await jobs.getJob("workspace", job.id);
    for (let i = 0; i < 100 && ["queued", "processing"].includes(final!.status); i++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      final = await jobs.getJob("workspace", job.id);
    }
    assert.equal(final?.status, "failed");
    assert.equal(calls.length, 0);
  });
});

test("accepted publication retains its confirmed product snapshot", async () => {
  await withEbay({}, async calls => {
    const jobs = createPublishJobRepository();
    const original = withProductRevision(structuredClone(product));
    const create = jobs.createJob.bind(jobs);
    jobs.createJob = async input => {
      original.title = "Later edit must not be published";
      original.channelOverrides.ebay!.aspects!.Size = ["XL"];
      return create(input);
    };
    const service = createPublishingService(jobs, connectedRepository(), env);
    const job = await service.enqueuePublishJob({ workspaceId: "workspace", product: original,
      expectedRevision: original.revision, channelIds: ["ebay"], connections: [record.connection], connectionRecords: [record] });
    let final = await jobs.getJob("workspace", job.id);
    for (let i = 0; i < 100 && ["queued", "processing"].includes(final!.status); i++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      final = await jobs.getJob("workspace", job.id);
    }
    assert.equal(final?.status, "completed");
    const inventory = calls.find(call => call.path.includes("inventory_item"))!;
    assert.equal(inventory.body.product.title, product.title);
    assert.deepEqual(inventory.body.product.aspects.Size, ["M"]);
  });
});

test("shirt publishes only after metadata validation, with photos and string-array aspects inside product", async () => {
  await withEbay({}, async calls => {
    const result = await createEbayPublishAdapter(env).publish(product, record);
    assert.equal(result.status, "published");
    assert.match(result.message, /123/);
    assert.deepEqual(result.remoteListing, { channelId: "ebay", environment: "sandbox", marketplaceId: "EBAY_US", sku: "SHIRT-1", offerId: "offer", listingId: "123" });
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

test("publish checkpoints persist the offer before the publish request", async () => {
  await withEbay({}, async calls => {
    const stages: string[] = [];
    const result = await createEbayPublishAdapter(env).publish(product, record, undefined, {
      checkpoint: async checkpoint => {
        stages.push(checkpoint.stage);
        assert(!calls.some(call => call.path.endsWith("/publish")));
        if (checkpoint.stage === "offer_saved" || checkpoint.stage === "publish_requested") {
          assert.equal(checkpoint.remoteListing?.channelId, "ebay");
          assert.equal(checkpoint.remoteListing?.channelId === "ebay" && checkpoint.remoteListing.offerId, "offer");
          assert(calls.some(call => call.method === "POST" && call.path === "/sell/inventory/v1/offer"));
        }
      }
    });
    assert.equal(result.status, "published");
    assert.deepEqual(stages, ["inventory_write_requested", "inventory_written", "offer_write_requested", "offer_saved", "publish_requested"]);
    assert.equal(calls.filter(call => call.path.endsWith("/publish")).length, 1);
  });
});

test("failed offer checkpoint prevents publishing an unpersisted offer", async () => {
  await withEbay({}, async calls => {
    await assert.rejects(createEbayPublishAdapter(env).publish(product, record, undefined, {
      checkpoint: async checkpoint => {
        if (checkpoint.stage === "offer_saved") throw new Error("checkpoint storage unavailable");
      }
    }), /checkpoint storage unavailable/);
    assert.equal(calls.filter(call => call.method === "POST" && call.path === "/sell/inventory/v1/offer").length, 1);
    assert(!calls.some(call => call.path.endsWith("/publish")));
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
    const result = await createEbayPublishAdapter(env).publish(product, record, savedReference);
    assert.equal(result.status, "published", result.message);
    assert.equal(result.remoteListing?.channelId, "ebay");
    assert.equal(result.remoteListing?.channelId === "ebay" && result.remoteListing.listingId, "123");
    assert(!calls.some(call => call.method === "POST" && call.path.includes("/offer")));
  });
});

test("HTTP success without a listing ID is not published success", async () => {
  await withEbay({ noListingId: true }, async () => {
    const result = await createEbayPublishAdapter(env).publish(product, record);
    assert.equal(result.status, "failed");
    assert.deepEqual(result.remoteListing, { channelId: "ebay", environment: "sandbox", marketplaceId: "EBAY_US", sku: "SHIRT-1", offerId: "offer" });
  });
});

test("Etsy preview never invents handmade claims and preserves explicit overrides", () => {
  assert.equal(buildPublishPreview(product, ["etsy"]).items[0].title, product.title);
  const custom = structuredClone(product);
  custom.channelOverrides.etsy = { title: "Seller supplied title" };
  assert.equal(buildPublishPreview(custom, ["etsy"]).items[0].title, "Seller supplied title");
});

test("a publish transport failure retains the known offer without inventing a listing ID", async () => {
  await withEbay({ publishNetworkError: true }, async calls => {
    const result = await createEbayPublishAdapter(env).publish(product, record);
    assert.equal(result.status, "failed");
    assert.deepEqual(result.remoteListing, { channelId: "ebay", environment: "sandbox", marketplaceId: "EBAY_US", sku: "SHIRT-1", offerId: "offer" });
    assert.equal(calls.filter(call => call.path.endsWith("/publish")).length, 1);
  });
});

test("credential persistence failure does not turn a confirmed publication into a failed job", async () => {
  await withEbay({}, async calls => {
    const jobs = createPublishJobRepository();
    const connections = connectedRepository();
    connections.setCredentialsForConnection = async () => {
      if (calls.some(call => call.path.endsWith("/publish"))) throw new Error("database unavailable");
    };
    const service = createPublishingService(jobs, connections, env);
    const job = await service.enqueuePublishJob({ workspaceId: "workspace", product, channelIds: ["ebay"], connections: [record.connection], connectionRecords: [record] });
    let final = await jobs.getJob("workspace", job.id);
    for (let i = 0; i < 100 && ["queued", "processing"].includes(final!.status); i++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      final = await jobs.getJob("workspace", job.id);
    }
    assert.equal(final?.status, "completed");
    assert.match(final!.targets[0].message!, /credentials could not be saved/);
    const remote = final?.targets[0].remoteListing;
    assert.equal(remote?.channelId === "ebay" && remote.listingId, "123");
  });
});

test("service retains a known offer when its checkpoint fails but result storage recovers", async () => {
  await withEbay({}, async calls => {
    const jobs = createPublishJobRepository();
    const listings = createChannelListingRepository();
    const checkpoint = listings.recordCheckpoint.bind(listings);
    listings.recordCheckpoint = async (identity, revision, state, executionId) => {
      if (state.stage === "offer_saved") throw new Error("temporary storage failure");
      await checkpoint(identity, revision, state, executionId);
    };
    const service = createPublishingService(jobs, connectedRepository(), env, listings);
    const job = await service.enqueuePublishJob({ workspaceId: "workspace", product, channelIds: ["ebay"], connections: [record.connection], connectionRecords: [record] });
    let final = await jobs.getJob("workspace", job.id);
    for (let i = 0; i < 100 && ["queued", "processing"].includes(final!.status); i++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      final = await jobs.getJob("workspace", job.id);
    }
    assert.equal(final?.status, "failed");
    const listing = await listings.get({ workspaceId: "workspace", productId: product.id,
      connectionId: record.connection.id, channelId: "ebay", environment: "sandbox", marketplaceId: "EBAY_US",
      sku: product.sku, externalAccountId: "" });
    assert.equal(listing?.status, "needs_review");
    assert.equal(listing?.remoteListing?.channelId === "ebay" && listing.remoteListing.offerId, "offer");
    assert(!calls.some(call => call.path.endsWith("/publish")));
  });
});

test("failed assessment never claims the listing or writes to eBay and permits a later retry", async () => {
  await withEbay({}, async calls => {
    const jobs = createPublishJobRepository();
    const connections = connectedRepository();
    const listings = createChannelListingRepository();
    const persist = connections.setCredentialsForConnection;
    connections.setCredentialsForConnection = async () => { throw new Error("database unavailable"); };
    const service = createPublishingService(jobs, connections, env, listings);
    async function publish() {
      const job = await service.enqueuePublishJob({ workspaceId: "workspace", product, channelIds: ["ebay"], connections: [record.connection], connectionRecords: [record] });
      let final = await jobs.getJob("workspace", job.id);
      for (let i = 0; i < 100 && ["queued", "processing"].includes(final!.status); i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
        final = await jobs.getJob("workspace", job.id);
      }
      return final!;
    }
    assert.equal((await publish()).status, "failed");
    assert(calls.every(call => call.method === "GET"));
    assert.equal(await listings.get({ workspaceId: "workspace", productId: product.id, connectionId: record.connection.id,
      channelId: "ebay", externalAccountId: "", environment: "sandbox", marketplaceId: "EBAY_US", sku: product.sku }), undefined);
    connections.setCredentialsForConnection = persist;
    assert.equal((await publish()).status, "completed");
  });
});

test("publish job stores the connection and typed remote identity without leaking tokens", async () => {
  await withEbay({}, async () => {
    const jobs = createPublishJobRepository();
    const service = createPublishingService(jobs, connectedRepository(), env);
    const job = await service.enqueuePublishJob({ workspaceId: "workspace", product, channelIds: ["ebay"], connections: [record.connection], connectionRecords: [record] });
    assert.equal(job.targets[0].connectionId, record.connection.id);
    let final = await jobs.getJob("workspace", job.id);
    for (let i = 0; i < 100 && ["queued", "processing"].includes(final!.status); i++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      final = await jobs.getJob("workspace", job.id);
    }
    assert.equal(final?.status, "completed");
    assert.deepEqual(final?.targets[0].remoteListing, { channelId: "ebay", environment: "sandbox", marketplaceId: "EBAY_US", sku: "SHIRT-1", offerId: "offer", listingId: "123" });
    assert(!JSON.stringify(final).includes("test-user-token"));
    assert.equal(await jobs.getJob("another-workspace", job.id), undefined);
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
  const repository = connectedRepository();
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

test("service persists listing ownership and blocks another product's SKU before eBay writes", async () => {
  await withEbay({}, async calls => {
    const jobs = createPublishJobRepository();
    const listings = createChannelListingRepository();
    const service = createPublishingService(jobs, connectedRepository(), env, listings);
    async function publish(item: Product) {
      const job = await service.enqueuePublishJob({ workspaceId: "workspace", product: item, channelIds: ["ebay"], connections: [record.connection], connectionRecords: [record] });
      let result = await jobs.getJob("workspace", job.id);
      for (let i = 0; i < 100 && ["queued", "processing"].includes(result!.status); i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
        result = await jobs.getJob("workspace", job.id);
      }
      return result!;
    }
    assert.equal((await publish(product)).status, "completed");
    const count = calls.length;
    const duplicate = await publish({ ...product, id: "second-shirt" });
    assert.equal(duplicate.status, "failed");
    assert.match(duplicate.targets[0].message!, /already assigned/);
    assert(calls.slice(count).every(call => call.method === "GET"), "assessment reads are allowed, conflicting product writes are not");
    const listing = await listings.reserve({ workspaceId: "workspace", productId: product.id,
      connectionId: record.connection.id, channelId: "ebay", externalAccountId: "", environment: "sandbox", marketplaceId: "EBAY_US", sku: product.sku });
    assert.equal(listing.remoteListing?.channelId, "ebay");
    assert.match(listing.appliedRevision!, /^[a-f0-9]{64}$/);
    assert(listing.lastPublishedAt);
  });
});

test("service rejects a target bound to a foreign workspace before calling eBay", async () => {
  await withEbay({}, async calls => {
    const jobs = createPublishJobRepository();
    const service = createPublishingService(jobs, connectedRepository(), env);
    const job = await service.enqueuePublishJob({ workspaceId: "other-workspace", product, channelIds: ["ebay"], connections: [record.connection], connectionRecords: [record] });
    let result = await jobs.getJob("other-workspace", job.id);
    for (let i = 0; i < 100 && ["queued", "processing"].includes(result!.status); i++) {
      await new Promise(resolve => setTimeout(resolve, 5));
      result = await jobs.getJob("other-workspace", job.id);
    }
    assert.equal(result?.status, "failed");
    assert.equal(calls.length, 0);
  });
});

for (const channelId of ["ebay", "shopify"] as const) {
  test(`job terminates on ${channelId === "ebay" ? "transport exception" : "unsupported channel"}`, async () => {
    await withEbay({ networkError: true }, async () => {
      const jobs = createPublishJobRepository();
      const connections = connectedRepository();
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
