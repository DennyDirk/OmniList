import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { getEnv } from "../apps/api/src/config/env";
import { createEtsyOAuthAdapter } from "../apps/api/src/modules/channels/adapters/etsy-oauth.adapter";
import { createEtsyConnectionService } from "../apps/api/src/modules/channels/etsy-connection.service";
import { createChannelAuthService } from "../apps/api/src/modules/channels/channel-auth.service";
import { createChannelConnectionRepository } from "../apps/api/src/modules/channels/channel-connections.repository";
import type { ChannelOAuthAttemptRepository, OAuthAttemptInput } from "../apps/api/src/modules/channels/channel-oauth-attempts.repository";

const env = { ...getEnv(), publicWebUrl: "https://omnilist.example", etsyKeystring: "test-key", etsySharedSecret: "test-secret" };
const token = { access_token: "123.access", refresh_token: "123.refresh", token_type: "Bearer", expires_in: 3600, scope: "shops_r" };
const shop = { shop_id: 456, user_id: 123, shop_name: "TestShop", currency_code: "USD" };
const verifier = "a".repeat(43);
const mockFetch = (responses: (Response | Error)[], calls: { url: string; init?: RequestInit }[] = []): typeof fetch => async (url, init) => {
  calls.push({ url: String(url), init });
  const next = responses.shift();
  if (next instanceof Error) throw next;
  assert.ok(next, "unexpected external request");
  return next;
};
const json = (value: unknown, status = 200) => Response.json(value, { status });

test("Etsy config requires HTTPS and server credentials; no memory-only capability", () => {
  assert.equal(createEtsyOAuthAdapter({ ...env, etsyKeystring: undefined }), undefined);
  assert.equal(createEtsyOAuthAdapter({ ...env, etsySharedSecret: undefined }), undefined);
  assert.equal(createEtsyOAuthAdapter({ ...env, publicWebUrl: "http://localhost:3000" }), undefined);
  assert.equal(createChannelAuthService(createChannelConnectionRepository(), env).listCapabilities().find(c => c.channelId === "etsy")?.enabled, false);
});

test("Etsy authorize uses exact web callback and S256, with no secret or write scopes", () => {
  const url = new URL(createEtsyOAuthAdapter(env)!.beginConnection("state", verifier));
  assert.equal(url.origin + url.pathname, "https://www.etsy.com/oauth/connect");
  assert.equal(url.searchParams.get("redirect_uri"), "https://omnilist.example/api/proxy/channel-connections/etsy/connect/callback");
  assert.equal(url.searchParams.get("code_challenge"), createHash("sha256").update(verifier).digest("base64url"));
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "shops_r");
  assert.equal(url.href.includes("test-secret"), false);
  assert.equal(url.href.includes(verifier), false);
});

test("Etsy exchanges code once then verifies the token owner's shop; secrets stay private", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const adapter = createEtsyOAuthAdapter(env, mockFetch([json(token), json(shop)], calls))!;
  const result = await adapter.completeConnection("auth-code", verifier);
  const body = calls[0].init!.body as URLSearchParams;
  assert.equal(body.get("code_verifier"), verifier);
  assert.equal(body.get("redirect_uri"), new URL(adapter.beginConnection("s", verifier)).searchParams.get("redirect_uri"));
  assert.equal(calls[0].init!.method, "POST");
  assert.equal(calls[1].url, "https://openapi.etsy.com/v3/application/users/123/shops");
  assert.equal(new Headers(calls[1].init!.headers).get("x-api-key"), "test-key:test-secret");
  assert.equal(new Headers(calls[1].init!.headers).get("authorization"), "Bearer 123.access");
  assert.equal(calls[0].init!.redirect, "error");
  assert.ok(calls[0].init!.signal);
  assert.equal(result.externalAccountId, "456");
  assert.equal(result.publicMetadata.shopName, "TestShop");
  assert.equal(result.credentials.refreshToken, "123.refresh");
  assert.equal(JSON.stringify(result.publicMetadata).includes("123.access"), false);
});

for (const [name, responses, error] of [
  ["missing grant", [json({ ...token, scope: "listings_r" })], "ETSY_MISSING_SCOPES"],
  ["malformed token", [json({ ...token, access_token: "no-owner-prefix" })], "ETSY_TOKEN_EXCHANGE_FAILED"],
  ["missing shop", [json(token), json({}, 404)], "ETSY_SHOP_NOT_FOUND"],
  ["other owner", [json(token), json({ ...shop, user_id: 999 })], "ETSY_SHOP_LOOKUP_FAILED"],
  ["invalid shop", [json(token), json({ results: [shop] })], "ETSY_SHOP_LOOKUP_FAILED"],
  ["upstream failure", [json({ error: "secret provider echo" }, 500)], "ETSY_TOKEN_EXCHANGE_FAILED"],
  ["rate limit", [json(token), json({}, 429)], "ETSY_SHOP_LOOKUP_FAILED"],
  ["network failure", [new Error("network secret")], "ETSY_TOKEN_EXCHANGE_FAILED"]
] as const) {
  test(`Etsy fails closed: ${name}`, async () => {
    await assert.rejects(createEtsyOAuthAdapter(env, mockFetch([...responses]))!.completeConnection("code", verifier),
      (err: Error) => err.message === error);
  });
}

test("Etsy attempt requires browser binding, survives service recreation and consumes cancellation/replay", async () => {
  const connections = createChannelConnectionRepository();
  let stored: OAuthAttemptInput | undefined;
  let consumed = false;
  let finishes = 0;
  const attempts: ChannelOAuthAttemptRepository = {
    async start(value) { stored = value; consumed = false; },
    async claim(id, browserHash, channelId) {
      if (!stored || consumed || stored.id !== id || stored.browserHash !== browserHash || stored.channelId !== channelId || stored.expiresAt.getTime() <= Date.now()) return;
      consumed = true;
      return { verifier: stored.verifier };
    },
    async finish(_id, result) {
      finishes++;
      return connections.upsertConnection(stored!.workspaceId, "etsy", { status: "connected", externalAccountId: result.externalAccountId, metadata: result.publicMetadata });
    },
    async disconnect() { stored = undefined; return undefined; }
  };
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher = mockFetch([json(token), json(shop)], calls);
  const first = createEtsyConnectionService(connections, env, attempts, fetcher);
  const second = createEtsyConnectionService(connections, env, attempts, fetcher);
  const begun = await first.beginConnection("workspace");
  const input = { code: "code", returnedState: new URL(begun.authorizationUrl).searchParams.get("state")!, stateCookieValue: begun.stateCookieValue };
  assert.equal(begun.authorizationUrl.includes(stored!.verifier), false);
  assert.notEqual(stored!.id, input.returnedState);
  assert.notEqual(stored!.browserHash, input.stateCookieValue);
  await assert.rejects(second.completeConnection({ ...input, stateCookieValue: undefined }), /INVALID_CHANNEL_CONNECT_STATE/);
  await assert.rejects(second.completeConnection({ ...input, stateCookieValue: "b".repeat(43) }), /INVALID_CHANNEL_CONNECT_STATE/);
  assert.equal(calls.length, 0);
  assert.equal((await second.completeConnection(input)).externalAccountId, "456");
  await assert.rejects(first.completeConnection(input), /INVALID_CHANNEL_CONNECT_STATE/);
  assert.equal(finishes, 1);
  assert.equal(calls.length, 2);
  const cancelled = await first.beginConnection("workspace");
  const cancelInput = { returnedState: new URL(cancelled.authorizationUrl).searchParams.get("state")!, stateCookieValue: cancelled.stateCookieValue };
  await assert.rejects(second.completeConnection({ ...cancelInput, error: "access_denied" }), /ETSY_CONNECT_CANCELLED/);
  await assert.rejects(second.completeConnection({ ...cancelInput, code: "code" }), /INVALID_CHANNEL_CONNECT_STATE/);
  assert.equal(calls.length, 2);
  assert.equal((await connections.getConnection("workspace", "etsy"))?.status, "connected");
});
