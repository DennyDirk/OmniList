import type { ApiEnv } from "../../../config/env";
import { exchangeEbayAuthorizationCode, getEbayBaseUrls, getEbayUserProfile, mapTokenToStoredCredentials } from "./ebay-client";

export interface ChannelOAuthCompletionResult {
  externalAccountId: string;
  publicMetadata: Record<string, string>;
  credentials: Record<string, string>;
}

export interface ChannelOAuthAdapter {
  providerLabel: string;
  isConfigured(): boolean;
  beginConnection(state: string): string;
  completeConnection(code: string): Promise<ChannelOAuthCompletionResult>;
}

export function createEbayOAuthAdapter(env: ApiEnv): ChannelOAuthAdapter | undefined {
  const clientId = env.ebayClientId;
  const clientSecret = env.ebayClientSecret;
  const redirectUriName = env.ebayRedirectUriName;

  if (!clientId || !clientSecret || !redirectUriName) {
    return undefined;
  }

  const baseUrls = getEbayBaseUrls(env.ebayEnvironment);

  return {
    providerLabel: "eBay OAuth",
    isConfigured() {
      return true;
    },
    beginConnection(state: string) {
      const query = [
        ["client_id", clientId],
        ["redirect_uri", redirectUriName],
        ["response_type", "code"],
        ["scope", env.ebayScopes.join(" ")],
        ["state", state]
      ]
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join("&");

      return `${baseUrls.authBaseUrl}/oauth2/authorize?${query}`;
    },
    async completeConnection(code: string) {
      const token = await exchangeEbayAuthorizationCode(env, code);
      let externalAccountId = "ebay-seller";

      try {
        const profile = await getEbayUserProfile(env, token.access_token);
        externalAccountId = profile.username ?? profile.userId ?? externalAccountId;
      } catch {}

      return {
        externalAccountId,
        publicMetadata: {
          authMode: "oauth",
          environment: env.ebayEnvironment,
          connectedAt: new Date().toISOString()
        },
        credentials: mapTokenToStoredCredentials(env, token)
      };
    }
  };
}
