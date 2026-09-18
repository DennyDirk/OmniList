import { createHash } from "node:crypto";
import { z } from "zod";
import type { ApiEnv } from "../../../config/env";
import type { ChannelOAuthCompletionResult } from "./channel-oauth.contract";

// Connection-only slice. Listing write permissions will require fresh consent later.
export const ETSY_CONNECT_SCOPES = ["shops_r"];
const tokenSchema = z.object({
  access_token: z.string().regex(/^[1-9]\d*\..+$/),
  refresh_token: z.string().min(1),
  token_type: z.string().regex(/^Bearer$/i),
  expires_in: z.number().int().positive(),
  scope: z.string()
});
const shopSchema = z.object({
  shop_id: z.number().int().positive().safe(),
  user_id: z.number().int().positive().safe(),
  shop_name: z.string().min(1),
  currency_code: z.string().regex(/^[A-Z]{3}$/)
});

export function createEtsyOAuthAdapter(env: ApiEnv, fetcher: typeof fetch = fetch) {
  if (!env.etsyKeystring || !env.etsySharedSecret) return undefined;
  const webUrl = new URL(env.publicWebUrl);
  if (webUrl.protocol !== "https:" || webUrl.username || webUrl.password || webUrl.pathname !== "/" || webUrl.search || webUrl.hash) return undefined;
  const redirectUri = `${webUrl.origin}/api/proxy/channel-connections/etsy/connect/callback`;
  const clientId = env.etsyKeystring;
  const apiKey = `${clientId}:${env.etsySharedSecret}`;

  async function request(url: string, init: RequestInit, errorCode: string) {
    try {
      const response = await fetcher(url, {
        ...init, redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { Accept: "application/json", "x-api-key": apiKey, ...init.headers }
      });
      if (response.status === 404 && errorCode === "ETSY_SHOP_LOOKUP_FAILED") throw new Error("ETSY_SHOP_NOT_FOUND");
      if (!response.ok) throw new Error(errorCode);
      return await response.json();
    } catch (error) {
      // Never surface OAuth codes, tokens, request bodies or provider error echoes.
      if (error instanceof Error && error.message === "ETSY_SHOP_NOT_FOUND") throw error;
      throw new Error(errorCode);
    }
  }

  return {
    beginConnection(state: string, verifier: string) {
      const query = new URLSearchParams({
        response_type: "code", client_id: clientId, redirect_uri: redirectUri,
        scope: ETSY_CONNECT_SCOPES.join(" "), state,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256"
      });
      return `https://www.etsy.com/oauth/connect?${query}`;
    },
    async completeConnection(code: string, verifier: string): Promise<ChannelOAuthCompletionResult> {
      const result = tokenSchema.safeParse(await request("https://api.etsy.com/v3/public/oauth/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, redirect_uri: redirectUri, code, code_verifier: verifier })
      }, "ETSY_TOKEN_EXCHANGE_FAILED"));
      if (!result.success) throw new Error("ETSY_TOKEN_EXCHANGE_FAILED");
      const token = result.data;
      if (!ETSY_CONNECT_SCOPES.every(scope => token.scope.split(/\s+/).includes(scope))) throw new Error("ETSY_MISSING_SCOPES");
      const userId = token.access_token.split(".")[0];
      const shopResult = shopSchema.safeParse(await request(`https://openapi.etsy.com/v3/application/users/${userId}/shops`, {
        headers: { Authorization: `Bearer ${token.access_token}` }
      }, "ETSY_SHOP_LOOKUP_FAILED"));
      if (!shopResult.success || String(shopResult.data.user_id) !== userId) throw new Error("ETSY_SHOP_LOOKUP_FAILED");
      const shop = shopResult.data;
      return {
        externalAccountId: String(shop.shop_id),
        publicMetadata: { authMode: "oauth", environment: "production", shopName: shop.shop_name,
          currency: shop.currency_code, connectedAt: new Date().toISOString() },
        credentials: { accessToken: token.access_token, refreshToken: token.refresh_token,
          accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
          scopes: token.scope, userId, shopId: String(shop.shop_id) }
      };
    }
  };
}
