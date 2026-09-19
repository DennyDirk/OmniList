import assert from "node:assert/strict";
import { test } from "node:test";
import { etsySetupOptionsSchema } from "@omnilist/shared";
import { getEnv } from "../apps/api/src/config/env";
import { createEtsySetupClient } from "../apps/api/src/modules/channels/adapters/etsy-setup.client";
import { createEtsySetupService } from "../apps/api/src/modules/channels/etsy-setup.service";
import { createChannelConnectionRepository } from "../apps/api/src/modules/channels/channel-connections.repository";

const env = { ...getEnv(), etsyKeystring: "key", etsySharedSecret: "secret" };
const credentials = { userId: "123", shopId: "456", accessToken: "123.access", refreshToken: "123.refresh",
  scopes: "shops_r", accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString() };
const shipping = { shipping_profile_id: 10, user_id: 123, title: "Domestic shipping", is_deleted: false };
const returns = { return_policy_id: 20, shop_id: 456, accepts_returns: false, accepts_exchanges: false, return_deadline: null };
const processing = { readiness_state_id: 30, shop_id: 456, readiness_state: "made_to_order", processing_days_display_label: "3-5 business days" };
const page = (...results: unknown[]) => ({ count: results.length, results });
function client(responses: (unknown | Response)[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  return { calls, remote: createEtsySetupClient(env, async (url, init) => {
    calls.push({ url: String(url), init });
    assert.ok(responses.length, "unexpected HTTP request");
    const next = responses.shift();
    return next instanceof Response ? next : Response.json(next);
  }) };
}

test("Etsy setup normalizes owned profiles, hides raw credentials, omits deleted shipping profiles", async () => {
  const { remote, calls } = client([page(shipping, { ...shipping, shipping_profile_id: 11, is_deleted: true }), page(returns), page(processing)]);
  const options = await remote.setup(credentials);
  assert.deepEqual(options.shippingProfiles, [{ id: "10", title: "Domestic shipping" }]);
  assert.deepEqual(options.returnPolicies, [{ id: "20", acceptsReturns: false, acceptsExchanges: false, returnDeadline: null }]);
  assert.deepEqual(options.processingProfiles, [{ id: "30", state: "made_to_order", label: "3-5 business days" }]);
  assert.ok(calls.every(c => c.url.startsWith("https://openapi.etsy.com/v3/application/shops/456/") && !c.init?.method));
  assert.equal(new Headers(calls[0].init!.headers).get("x-api-key"), "key:secret");
  assert.equal(JSON.stringify(options).includes("123.access"), false);
  assert.equal(etsySetupOptionsSchema.safeParse({ ...options, shopId: "456", connectionId: "c", checkedAt: new Date().toISOString() }).success, true);
});

test("Etsy processing profiles use bounded pagination rather than silently truncating", async () => {
  const { remote, calls } = client([page(), page(), { count: 2, results: [processing] },
    { count: 2, results: [{ ...processing, readiness_state_id: 31 }] }]);
  assert.equal((await remote.setup(credentials)).processingProfiles.length, 2);
  assert.ok(calls[2].url.endsWith("?limit=100&offset=0"));
  assert.ok(calls[3].url.endsWith("?limit=100&offset=1"));
});

for (const [name, responses, code] of [
  ["missing payload", [{}], "ETSY_INVALID_RESPONSE"],
  ["incomplete shipping", [{ count: 2, results: [shipping] }], "ETSY_SETUP_INCOMPLETE"],
  ["wrong owner", [page({ ...shipping, user_id: 999 }), page(), page()], "ETSY_INVALID_RESPONSE"],
  ["wrong return shop", [page(), page({ ...returns, shop_id: 999 }), page()], "ETSY_INVALID_RESPONSE"],
  ["duplicate profile", [page(), page(), { count: 2, results: [processing, processing] }], "ETSY_SETUP_INCOMPLETE"],
  ["empty page before completion", [page(), page(), { count: 1, results: [] }], "ETSY_SETUP_INCOMPLETE"],
  ["rate limit", [Response.json({}, { status: 429 })], "ETSY_RATE_LIMITED"],
  ["authorization lost", [Response.json({}, { status: 401 })], "ETSY_RECONNECT_REQUIRED"],
  ["server failure", [Response.json({ secret: "echo" }, { status: 500 })], "ETSY_SETUP_FAILED"]
] as const) {
  test(`Etsy setup fails closed: ${name}`, async () => {
    await assert.rejects(client([...responses]).remote.setup(credentials), (err: Error) => err.message === code);
  });
}

test("Etsy token refresh preserves shop identity and stores the rotated token", async () => {
  const token = { access_token: "123.new", refresh_token: "123.rotated", expires_in: 3600, token_type: "Bearer", scope: "shops_r" };
  const { remote, calls } = client([token]);
  assert.deepEqual(await remote.authorize(credentials), credentials);
  assert.equal(calls.length, 0);
  const updated = await remote.authorize({ ...credentials, accessTokenExpiresAt: "2000-01-01T00:00:00Z" });
  assert.equal(updated.refreshToken, "123.rotated");
  assert.equal(updated.shopId, "456");
  assert.ok(Date.parse(updated.accessTokenExpiresAt) > Date.now());
  assert.equal((calls[0].init!.body as URLSearchParams).get("grant_type"), "refresh_token");
  assert.equal((calls[0].init!.body as URLSearchParams).get("refresh_token"), "123.refresh");
  for (const bad of [{ ...token, access_token: "999.other" }, { ...token, scope: "listings_r" }, {}]) {
    await assert.rejects(client([bad]).remote.authorize({ ...credentials, accessTokenExpiresAt: "expired" }), /ETSY_RECONNECT_REQUIRED/);
  }
});

test("Etsy setup rejects a disconnect/reconnect while reads are in flight", async () => {
  const connections = createChannelConnectionRepository();
  await connections.upsertConnection("workspace", "etsy", { status: "connected", externalAccountId: "456", metadata: { connectedAt: "first" } });
  await connections.setCredentials("workspace", "etsy", credentials);
  const sessions = { async authorize(workspace: string) { return structuredClone((await connections.getConnectionRecord(workspace, "etsy"))!); } };
  const service = createEtsySetupService(env, connections, sessions, {
    async authorize(value) { return value; },
    async setup() {
      await connections.upsertConnection("workspace", "etsy", { status: "connected", externalAccountId: "456", metadata: { connectedAt: "new" } });
      return { shippingProfiles: [], returnPolicies: [], processingProfiles: [] };
    }
  });
  await assert.rejects(service.load("workspace"), /ETSY_CONNECTION_CHANGED/);
  const happy = createEtsySetupService(env, connections, sessions, client([page(), page(), page()]).remote);
  const result = await happy.load("workspace");
  assert.equal(result.shopId, "456");
  assert.equal("credentials" in result, false);
  assert.equal(result.shippingProfiles.length, 0);
});
