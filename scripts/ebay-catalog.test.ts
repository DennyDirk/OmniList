import { test } from "node:test";
import assert from "node:assert/strict";
import { createEbayCatalogService } from "../apps/api/src/modules/catalog/ebay-catalog.service";
import { createChannelConnectionRepository } from "../apps/api/src/modules/channels/channel-connections.repository";
import type { ApiEnv } from "../apps/api/src/config/env";

const env: ApiEnv = {
  nodeEnv: "test", port: 4000, publicApiUrl: "http://localhost:4000", publicWebUrl: "http://localhost:3000",
  ebayEnvironment: "sandbox", ebayScopes: [], supabaseStorageBucket: "images"
};
async function setup() {
  const repo = createChannelConnectionRepository();
  await repo.upsertConnection("workspace", "ebay", { status: "connected", externalAccountId: "seller", metadata: {} });
  await repo.setCredentials("workspace", "ebay", {
    accessToken: "secret", refreshToken: "refresh", accessTokenExpiresAt: "2099-01-01", environment: "sandbox"
  });
  return { repo, service: createEbayCatalogService(repo, env) };
}
async function withFetch(fn: typeof fetch, run: () => Promise<void>) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try { await run(); } finally { globalThis.fetch = original; }
}

test("catalog preview reads one bounded page without returning credentials or remote payloads", async () => {
  const { service } = await setup();
  await withFetch(async (url, init) => {
    assert.equal(String(url), "https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item?limit=20&offset=0");
    assert.equal(init?.method, "GET");
    return Response.json({ total: 21, inventoryItems: Array.from({ length: 20 }, (_, i) => ({
      sku: `SKU-${i}`, product: { title: "Shirt", description: "Not exposed" }, secret: "hidden"
    })) });
  }, async () => {
    const result = await service.list("workspace", 0);
    assert.equal(result.items.length, 20);
    assert.equal(result.nextOffset, 20);
    assert.equal(result.environment, "sandbox");
    assert(!JSON.stringify(result).includes("secret"));
    assert(!JSON.stringify(result).includes("Not exposed"));
  });
});

test("catalog accepts a genuinely empty inventory and a final page", async () => {
  const { service } = await setup();
  await withFetch(async () => Response.json({ total: 0 }), async () => {
    assert.deepEqual((await service.list("workspace", 0)).items, []);
  });
  await withFetch(async () => Response.json({ total: 21, inventoryItems: [{ sku: "last" }] }), async () => {
    const result = await service.list("workspace", 20);
    assert.equal(result.nextOffset, null);
    assert.equal(result.items[0].title, "last");
  });
});

test("catalog rejects errors and malformed responses instead of showing an empty store", async () => {
  const { service } = await setup();
  for (const body of [{}, { total: 1 }, { total: 2, inventoryItems: [{ sku: "one" }] }, { total: 1, inventoryItems: [{}] }]) {
    await withFetch(async () => Response.json(body), async () => {
      await assert.rejects(service.list("workspace", 0), /incomplete/);
    });
  }
  await withFetch(async () => Response.json({ message: "secret internal error" }, { status: 500 }), async () => {
    await assert.rejects(service.list("workspace", 0), /could not load/);
  });
  await withFetch(async () => { throw new Error("network"); }, async () => {
    await assert.rejects(service.list("workspace", 0), /unavailable/);
  });
});

test("catalog rejects invalid pages, another workspace and environment before fetching", async () => {
  const { service, repo } = await setup();
  await withFetch(async () => { assert.fail("Must not fetch"); }, async () => {
    for (const offset of [-1, 1, NaN, Infinity, 100020]) {
      await assert.rejects(service.list("workspace", offset), /Invalid/);
    }
    await assert.rejects(service.list("other-workspace", 0), /Connect eBay/);
    await repo.setCredentials("workspace", "ebay", { environment: "production" });
    await assert.rejects(service.list("workspace", 0), /authorize/);
  });
});

test("catalog discards data if the account disconnects during the request", async () => {
  const { service, repo } = await setup();
  await withFetch(async () => {
    await repo.upsertConnection("workspace", "ebay", { status: "disconnected", metadata: {} });
    return Response.json({ total: 0 });
  }, async () => {
    await assert.rejects(service.list("workspace", 0), /connection changed/);
  });
});
