import { test } from "node:test";
import assert from "node:assert/strict";
import { productUpsertInputSchema, type Product } from "@omnilist/shared";
import { buildProductDraft } from "../apps/web/lib/product-draft";
import { flattenEbayCategories, matchEbayCategories } from "../apps/api/src/modules/channels/adapters/ebay-category-search";
import { getEbayListingStatus } from "../apps/api/src/modules/channels/adapters/ebay-listing-status";
import { ensureValidEbayAccessToken } from "../apps/api/src/modules/channels/adapters/ebay-client";
import type { ApiEnv } from "../apps/api/src/config/env";

const env: ApiEnv = {
  nodeEnv: "test", port: 4000, publicApiUrl: "http://localhost:4000", publicWebUrl: "http://localhost:3000",
  ebayEnvironment: "sandbox", ebayScopes: [], supabaseStorageBucket: "images"
};
const fields = { title: "Cotton shirt", description: "A cotton shirt in size M.", sku: "SHIRT-1", price: "20,50", quantity: "1" };

test("simplified editor preserves other channels, internal metadata and every variant option", () => {
  const initial: Product = {
    id: "p1", title: fields.title, description: fields.description, sku: fields.sku, basePrice: 20, quantity: 1,
    brand: "Brand", attributes: { material: "Cotton", custom: "Keep" }, categoryId: "internal", categoryLabel: "Internal label", images: [],
    variants: [{ id: "v1", sku: "v1", price: 10, quantity: 1, options: [{ name: "Size", value: "M" }, { name: "Color", value: "Black" }, { name: "Fit", value: "Slim" }] }],
    channelOverrides: { etsy: { title: "Etsy cotton shirt", aspects: { Material: ["Cotton"] } }, shopify: { price: 40 }, ebay: { categoryId: "15687" } }
  };
  const draft = productUpsertInputSchema.parse(buildProductDraft(fields, [], { categoryId: "15687", condition: "NEW" }, initial));
  assert.deepEqual(draft.variants, initial.variants);
  assert.deepEqual(draft.attributes, initial.attributes);
  assert.deepEqual(draft.channelOverrides.etsy, initial.channelOverrides.etsy);
  assert.deepEqual(draft.channelOverrides.shopify, initial.channelOverrides.shopify);
  assert.equal(draft.categoryId, "internal");
  assert.equal(draft.brand, "Brand");
  assert.equal(draft.basePrice, 20.5);
});

test("drafts can be saved before category selection but blank numbers are not silently zero", () => {
  assert(productUpsertInputSchema.safeParse(buildProductDraft(fields, [], {})).success);
  for (const key of ["price", "quantity"] as const) {
    assert.equal(productUpsertInputSchema.safeParse(buildProductDraft({ ...fields, [key]: "" }, [], {})).success, false);
  }
});

test("category search returns real leaf paths, never parent IDs", () => {
  const choices = flattenEbayCategories({ category: { categoryId: "0", categoryName: "Root" }, childCategoryTreeNodes: [
    { category: { categoryId: "1", categoryName: "Men" }, childCategoryTreeNodes: [
      { category: { categoryId: "15687", categoryName: "T-Shirts" }, leafCategoryTreeNode: true }
    ] },
    { category: { categoryId: "261328", categoryName: "Trading Card Singles" }, leafCategoryTreeNode: true }
  ] });
  assert.deepEqual(matchEbayCategories(choices, "men t shirts"), [{ id: "15687", name: "T-Shirts", path: "Men > T-Shirts" }]);
  assert.deepEqual(matchEbayCategories(choices, "sneakers"), []);
  assert.deepEqual(matchEbayCategories(choices, "  "), []);
  assert(!choices.some(item => item.id === "1"));
});

test("listing verification is read-only, uses SKU and retains unpublished/ended statuses", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.hostname, "api.sandbox.ebay.com");
    assert.equal(url.searchParams.get("sku"), "SKU / 2");
    assert.equal(init?.method, "GET");
    return new Response(JSON.stringify({ offers: [
      { offerId: "1", status: "PUBLISHED", listing: { listingId: "110590629280", listingStatus: "ACTIVE" } },
      { offerId: "2", status: "UNPUBLISHED", listing: { listingId: "110590629279", listingStatus: "ENDED" } }
    ] }));
  };
  try {
    const result = await getEbayListingStatus(env, "test-token", "SKU / 2", "EBAY_US");
    assert.equal(calls, 1);
    assert.equal(result.environment, "sandbox");
    assert.equal(result.offers[0].url, "https://www.sandbox.ebay.com/itm/110590629280");
    assert.equal(result.offers[1].status, "UNPUBLISHED");
    assert.equal(result.offers[1].listingStatus, "ENDED");
  } finally { globalThis.fetch = original; }
});

test("verification errors are not represented as an empty successful result", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ errors: [{ message: "System error" }] }), { status: 500 });
  try { await assert.rejects(getEbayListingStatus(env, "test-token", "sku", "EBAY_US"), /HTTP 500/); }
  finally { globalThis.fetch = original; }
});

test("environment change requires reconnecting, even for an unexpired token", async () => {
  await assert.rejects(ensureValidEbayAccessToken(env, { environment: "production", accessToken: "test-token", accessTokenExpiresAt: "2099-01-01T00:00:00Z" }), /RECONNECT_REQUIRED/);
});
