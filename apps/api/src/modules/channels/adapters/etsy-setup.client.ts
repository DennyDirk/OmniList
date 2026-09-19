import { z } from "zod";
import type { ApiEnv } from "../../../config/env";
import type { EtsySetupOptions } from "@omnilist/shared";
import { createEtsyRequester } from "./etsy-http";
import { etsyTokenSchema } from "./etsy-oauth.adapter";

const numericId = z.number().int().positive().safe();
const shippingSchema = z.object({ shipping_profile_id: numericId, user_id: numericId,
  title: z.string().min(1), is_deleted: z.boolean() });
const returnSchema = z.object({ return_policy_id: numericId, shop_id: numericId,
  accepts_returns: z.boolean(), accepts_exchanges: z.boolean(), return_deadline: z.number().int().nonnegative().nullable() });
const processingSchema = z.object({ readiness_state_id: numericId, shop_id: numericId,
  readiness_state: z.enum(["ready_to_ship", "made_to_order"]), processing_days_display_label: z.string().min(1) });

export function createEtsySetupClient(env: ApiEnv, fetcher: typeof fetch = fetch) {
  const request = createEtsyRequester(env, fetcher);
  return {
    async authorize(credentials: Record<string, string>) {
      const { userId, shopId, accessToken, refreshToken, accessTokenExpiresAt, scopes } = credentials;
      if (!/^[1-9]\d*$/.test(userId ?? "") || !/^[1-9]\d*$/.test(shopId ?? "") ||
        !accessToken?.startsWith(`${userId}.`) || !scopes?.split(/\s+/).includes("shops_r")) throw new Error("ETSY_RECONNECT_REQUIRED");
      if (Date.parse(accessTokenExpiresAt) > Date.now() + 60_000) return credentials;
      if (!refreshToken) throw new Error("ETSY_RECONNECT_REQUIRED");
      const response = await request("https://api.etsy.com/v3/public/oauth/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "refresh_token", client_id: env.etsyKeystring ?? "", refresh_token: refreshToken })
      }, "ETSY_REFRESH_FAILED");
      const parsed = etsyTokenSchema.safeParse(response);
      if (!parsed.success || !parsed.data.access_token.startsWith(`${userId}.`) ||
        !parsed.data.scope.split(/\s+/).includes("shops_r")) throw new Error("ETSY_RECONNECT_REQUIRED");
      const token = parsed.data;
      return { ...credentials, accessToken: token.access_token, refreshToken: token.refresh_token,
        accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(), scopes: token.scope };
    },
    async setup(credentials: Record<string, string>): Promise<Pick<EtsySetupOptions, "shippingProfiles" | "returnPolicies" | "processingProfiles">> {
      const { shopId, userId, accessToken } = credentials;
      if (!/^[1-9]\d*$/.test(shopId ?? "") || !/^[1-9]\d*$/.test(userId ?? "") || !accessToken?.startsWith(`${userId}.`)) throw new Error("ETSY_RECONNECT_REQUIRED");
      const base = `https://openapi.etsy.com/v3/application/shops/${shopId}`;
      const signal = AbortSignal.timeout(25_000);
      async function list<T>(path: string, schema: z.ZodType<T>, paginated = false): Promise<T[]> {
        const items: T[] = [];
        let expected: number | undefined;
        let pages = 0;
        do {
          if (++pages > 10) throw new Error("ETSY_SETUP_INCOMPLETE");
          const parsed = z.object({ count: z.number().int().nonnegative().max(1000), results: z.array(schema).max(1000) })
            .safeParse(await request(`${base}/${path}${paginated ? `?limit=100&offset=${items.length}` : ""}`,
              { signal, headers: { Authorization: `Bearer ${accessToken}` } }, "ETSY_SETUP_FAILED"));
          if (!parsed.success) throw new Error("ETSY_INVALID_RESPONSE");
          if (expected !== undefined && expected !== parsed.data.count) throw new Error("ETSY_SETUP_INCOMPLETE");
          expected = parsed.data.count;
          items.push(...parsed.data.results);
          if (items.length > expected || (!paginated && items.length !== expected) ||
            (items.length < expected && !parsed.data.results.length)) throw new Error("ETSY_SETUP_INCOMPLETE");
        } while (items.length < expected);
        return items;
      }
      const shipping = await list("shipping-profiles", shippingSchema);
      const returns = await list("policies/return", returnSchema);
      const processing = await list("readiness-state-definitions", processingSchema, true);
      if (shipping.some(p => String(p.user_id) !== userId) || returns.some(p => String(p.shop_id) !== shopId) ||
        processing.some(p => String(p.shop_id) !== shopId)) throw new Error("ETSY_INVALID_RESPONSE");
      for (const ids of [shipping.map(p => p.shipping_profile_id), returns.map(p => p.return_policy_id), processing.map(p => p.readiness_state_id)]) {
        if (new Set(ids).size !== ids.length) throw new Error("ETSY_SETUP_INCOMPLETE");
      }
      return {
        shippingProfiles: shipping.filter(p => !p.is_deleted).map(p => ({ id: String(p.shipping_profile_id), title: p.title })),
        returnPolicies: returns.map(p => ({ id: String(p.return_policy_id), acceptsReturns: p.accepts_returns,
          acceptsExchanges: p.accepts_exchanges, returnDeadline: p.return_deadline })),
        processingProfiles: processing.map(p => ({ id: String(p.readiness_state_id), state: p.readiness_state, label: p.processing_days_display_label }))
      };
    }
  };
}
