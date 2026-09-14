import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiEnv } from "../apps/api/src/config/env";
import { parseEbayItemDetails, readEbayItemDetails } from "../apps/api/src/modules/channels/adapters/ebay-item-details";
import { createEbayActiveCatalogService } from "../apps/api/src/modules/catalog/ebay-active-catalog.service";
import { createChannelConnectionRepository } from "../apps/api/src/modules/channels/channel-connections.repository";
import { ebayListingDetailsSchema } from "../packages/shared/src/ebay-catalog";

const env: ApiEnv = { nodeEnv: "test", port: 4000, publicApiUrl: "http://localhost:4000", publicWebUrl: "http://localhost:3000",
  ebayEnvironment: "sandbox", ebayScopes: [], supabaseStorageBucket: "images" };
const itemXml = `<GetItemResponse><Ack>Success</Ack><Item><ItemID>123</ItemID><Title>Cotton shirt</Title><SKU>SHIRT</SKU>
  <Seller><UserID>seller</UserID><Email>private@example.com</Email></Seller><Site>US</Site><ListingType>FixedPriceItem</ListingType>
  <PrimaryCategory><CategoryID>15687</CategoryID><CategoryName>Shirts</CategoryName></PrimaryCategory>
  <ConditionID>1000</ConditionID><ConditionDisplayName>New with tags</ConditionDisplayName>
  <Quantity>5</Quantity><SellingStatus><QuantitySold>2</QuantitySold><ListingStatus>Active</ListingStatus><CurrentPrice currencyID="USD">25.00</CurrentPrice></SellingStatus>
  <Description><![CDATA[<script>alert('unsafe')</script><p>Original description</p>]]></Description>
  <PictureDetails><PictureURL>https://example.com/shirt.jpg</PictureURL></PictureDetails>
  <ItemSpecifics><NameValueList><Name>Brand</Name><Value>Example</Value></NameValueList><NameValueList><Name>Color</Name><Value>Black</Value><Value>White</Value></NameValueList></ItemSpecifics>
  </Item></GetItemResponse>`;
const pageXml = `<GetMyeBaySellingResponse><Ack>Success</Ack><ActiveList><PaginationResult><TotalNumberOfEntries>1</TotalNumberOfEntries><TotalNumberOfPages>1</TotalNumberOfPages></PaginationResult>
  <ItemArray><Item><ItemID>123</ItemID><Title>Shirt</Title><ListingType>FixedPriceItem</ListingType></Item></ItemArray></ActiveList></GetMyeBaySellingResponse>`;

async function setup() {
  const connections = createChannelConnectionRepository();
  const connection = await connections.upsertConnection("workspace", "ebay", { status: "connected", externalAccountId: "ebay-seller", metadata: {} });
  await connections.setCredentials("workspace", "ebay", { accessToken: "secret", refreshToken: "refresh", environment: "sandbox", accessTokenExpiresAt: "2099-01-01" });
  return { connections, service: createEbayActiveCatalogService(connections, env), input: { listingId: "123", page: "1", connectionId: connection.id, environment: "sandbox" } };
}
async function withFetch(fn: typeof fetch, run: () => Promise<void>) {
  const previous = globalThis.fetch;
  globalThis.fetch = fn;
  try { await run(); } finally { globalThis.fetch = previous; }
}

test("GetItem preserves source facts, derives remaining stock and excludes HTML and private seller data", () => {
  const result = parseEbayItemDetails(itemXml, "123");
  assert.equal(result.quantity, 3);
  assert.equal(result.condition?.id, "1000");
  assert.deepEqual(result.price, { value: "25.00", currency: "USD" });
  assert.deepEqual(result.aspects[1], { name: "Color", values: ["Black", "White"] });
  assert.equal(result.pictureCount, 1);
  assert.equal(result.hasDescription, true);
  assert.equal(result.hasVariations, false);
  assert(!JSON.stringify(result).includes("<script"));
  assert(!JSON.stringify(result).includes("Original description"));
  assert(!JSON.stringify(result).includes("private@example.com"));
});

test("GetItem never guesses missing quantity, price or condition", () => {
  const result = parseEbayItemDetails(itemXml.replace("<QuantitySold>2</QuantitySold>", "")
    .replace('<CurrentPrice currencyID="USD">25.00</CurrentPrice>', "").replace("<ConditionID>1000</ConditionID>", ""), "123");
  assert.equal(result.quantity, undefined);
  assert.equal(result.price, undefined);
  assert.equal(result.condition, undefined);
  assert.equal(parseEbayItemDetails(itemXml.replace("<QuantitySold>2</QuantitySold>", "<QuantitySold>5</QuantitySold>"), "123").quantity, 0);
});

test("GetItem fails closed on malformed, mismatched and error responses", () => {
  for (const xml of ["<GetItemResponse><Ack>Success</Ack></GetItemResponse>", "not xml",
    itemXml.replace("<ItemID>123</ItemID>", "<ItemID>456</ItemID>"), itemXml.replace("<Ack>Success</Ack>", "<Ack>PartialFailure</Ack>"),
    itemXml.replace("<QuantitySold>2</QuantitySold>", "<QuantitySold>6</QuantitySold>"),
    itemXml.replace('<CurrentPrice currencyID="USD">25.00</CurrentPrice>', '<CurrentPrice currencyID="USD">NaN</CurrentPrice>'),
    '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'+itemXml]) {
    assert.throws(() => parseEbayItemDetails(xml, "123"));
  }
});

test("details validate token ownership before GetItem and return an explicit read-only identity", async () => {
  const { service, input } = await setup();
  const calls: string[] = [];
  await withFetch(async (url, init) => {
    assert.equal(String(url), "https://api.sandbox.ebay.com/ws/api.dll");
    const call = new Headers(init?.headers).get("X-EBAY-API-CALL-NAME")!;
    calls.push(call);
    if (call === "GetItem") {
      assert.match(String(init?.body), /<ItemID>123<\/ItemID>/);
      assert.match(String(init?.body), /<IncludeItemSpecifics>true/);
    }
    return new Response(call === "GetMyeBaySelling" ? pageXml : itemXml);
  }, async () => {
    const result = ebayListingDetailsSchema.parse(await service.details("workspace", input));
    assert.deepEqual(calls, ["GetMyeBaySelling", "GetItem"]);
    assert.deepEqual(result.source, { channelId: "ebay", api: "trading", connectionId: input.connectionId, environment: "sandbox", listingId: "123", sellerId: "seller" });
    assert.equal(result.importAvailable, false);
    assert.deepEqual(result.limitations, []);
    assert(!JSON.stringify(result).includes("secret"));
  });
});

test("details reject invalid IDs, pages, foreign workspaces and stale connection identity before fetching", async () => {
  const { service, input } = await setup();
  await withFetch(async () => { assert.fail("Must not fetch"); }, async () => {
    for (const override of [{ listingId: "123</ItemID>" }, { page: "1abc" }, { page: ["1"] }, { page: "126" },
      { connectionId: "other" }, { environment: "production" }]) await assert.rejects(service.details("workspace", { ...input, ...override }));
    await assert.rejects(service.details("other-workspace", input));
    await assert.rejects(readEbayItemDetails(env, "secret", "<bad>"));
  });
});

test("details do not fetch an arbitrary public listing absent from the account's active page", async () => {
  const { service, input } = await setup();
  await withFetch(async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("X-EBAY-API-CALL-NAME"), "GetMyeBaySelling");
    return new Response(pageXml.replace("<ItemID>123</ItemID>", "<ItemID>456</ItemID>"));
  }, async () => { await assert.rejects(service.details("workspace", input), /no longer/); });
});

test("details discard results when the connection changes during GetItem", async () => {
  const { connections, service, input } = await setup();
  await withFetch(async (_url, init) => {
    if (new Headers(init?.headers).get("X-EBAY-API-CALL-NAME") === "GetMyeBaySelling") return new Response(pageXml);
    await connections.upsertConnection("workspace", "ebay", { status: "disconnected", metadata: {} });
    return new Response(itemXml);
  }, async () => { await assert.rejects(service.details("workspace", input), /connection changed/); });
});

test("details flag variants, auctions, non-US currency and ended listings instead of marking them importable", async () => {
  const { service, input } = await setup();
  const unsupported = itemXml.replace("</Item>", "<Variations/></Item>").replace("FixedPriceItem", "Chinese")
    .replace('currencyID="USD"', 'currencyID="EUR"').replace("<ListingStatus>Active</ListingStatus>", "<ListingStatus>Completed</ListingStatus>");
  await withFetch(async (_url, init) => new Response(new Headers(init?.headers).get("X-EBAY-API-CALL-NAME") === "GetMyeBaySelling" ? pageXml : unsupported), async () => {
    const result = await service.details("workspace", input);
    assert.equal(result.importAvailable, false);
    assert.deepEqual(result.limitations, ["variations", "listing_type", "market", "inactive"]);
    assert.equal(result.price?.currency, "EUR");
  });
});

test("Trading reads reject network, HTTP and oversized responses", async () => {
  for (const respond of [async () => { throw new Error("network"); }, async () => new Response("private upstream message", { status: 500 }),
    async () => new Response("x".repeat(2_000_001))]) {
    await withFetch(respond, async () => { await assert.rejects(readEbayItemDetails(env, "secret", "123")); });
  }
});
