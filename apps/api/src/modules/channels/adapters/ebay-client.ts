import type { ApiEnv } from "../../../config/env";

export interface EbayUserTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface EbayOAuthCredentials {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt?: string;
  tokenType?: string;
  scope?: string;
  environment?: string;
}

function ensureEbayEnv(env: ApiEnv) {
  if (!env.ebayClientId || !env.ebayClientSecret || !env.ebayRedirectUriName) {
    throw new Error("EBAY_ENV_NOT_CONFIGURED");
  }
}

export function getEbayBaseUrls(environment: "sandbox" | "production") {
  if (environment === "production") {
    return {
      authBaseUrl: "https://auth.ebay.com",
      apiBaseUrl: "https://api.ebay.com"
    };
  }

  return {
    authBaseUrl: "https://auth.sandbox.ebay.com",
    apiBaseUrl: "https://api.sandbox.ebay.com"
  };
}

function getBasicAuthorizationHeader(env: ApiEnv) {
  ensureEbayEnv(env);
  return `Basic ${Buffer.from(`${env.ebayClientId}:${env.ebayClientSecret}`).toString("base64")}`;
}

function toCredentialRecord(env: ApiEnv, token: EbayUserTokenResponse, existing?: Partial<EbayOAuthCredentials>) {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? existing?.refreshToken ?? "",
    accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    refreshTokenExpiresAt:
      token.refresh_token_expires_in !== undefined
        ? new Date(Date.now() + token.refresh_token_expires_in * 1000).toISOString()
        : existing?.refreshTokenExpiresAt ?? "",
    tokenType: token.token_type ?? existing?.tokenType ?? "User Access Token",
    scope: token.scope ?? existing?.scope ?? env.ebayScopes.join(" "),
    environment: env.ebayEnvironment
  } satisfies Record<string, string>;
}

export async function exchangeEbayAuthorizationCode(env: ApiEnv, code: string) {
  ensureEbayEnv(env);
  const baseUrls = getEbayBaseUrls(env.ebayEnvironment);
  const payload = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.ebayRedirectUriName!
  });

  const response = await fetch(`${baseUrls.apiBaseUrl}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthorizationHeader(env),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString()
  });

  if (!response.ok) {
    throw new Error("EBAY_TOKEN_EXCHANGE_FAILED");
  }

  return (await response.json()) as EbayUserTokenResponse;
}

export async function refreshEbayUserAccessToken(env: ApiEnv, credentials: Record<string, string>) {
  ensureEbayEnv(env);
  const refreshToken = credentials.refreshToken;

  if (!refreshToken) {
    throw new Error("EBAY_REFRESH_TOKEN_MISSING");
  }

  const baseUrls = getEbayBaseUrls(env.ebayEnvironment);
  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: credentials.scope || env.ebayScopes.join(" ")
  });

  const response = await fetch(`${baseUrls.apiBaseUrl}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: getBasicAuthorizationHeader(env),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString()
  });

  if (!response.ok) {
    throw new Error("EBAY_REFRESH_TOKEN_FAILED");
  }

  const token = (await response.json()) as EbayUserTokenResponse;
  return toCredentialRecord(env, token, credentials);
}

export async function ensureValidEbayAccessToken(env: ApiEnv, credentials: Record<string, string>) {
  const accessToken = credentials.accessToken;
  const accessTokenExpiresAt = credentials.accessTokenExpiresAt ? Date.parse(credentials.accessTokenExpiresAt) : NaN;
  const isExpired = !accessToken || Number.isNaN(accessTokenExpiresAt) || accessTokenExpiresAt <= Date.now() + 60_000;

  if (!isExpired) {
    return {
      accessToken,
      credentials
    };
  }

  const nextCredentials = await refreshEbayUserAccessToken(env, credentials);

  return {
    accessToken: nextCredentials.accessToken,
    credentials: nextCredentials
  };
}

export async function getEbayUserProfile(env: ApiEnv, accessToken: string) {
  const baseUrls = getEbayBaseUrls(env.ebayEnvironment);
  const response = await fetch(`${baseUrls.apiBaseUrl}/commerce/identity/v1/user/`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("EBAY_PROFILE_FETCH_FAILED");
  }

  return (await response.json()) as {
    username?: string;
    userId?: string;
  };
}

export async function callEbayInventoryApi<TResponse>(
  env: ApiEnv,
  accessToken: string,
  input: {
    path: string;
    method: "GET" | "POST" | "PUT";
    body?: unknown;
    contentLanguage?: string;
  }
) {
  const baseUrls = getEbayBaseUrls(env.ebayEnvironment);
  const response = await fetch(`${baseUrls.apiBaseUrl}${input.path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Content-Language": input.contentLanguage ?? "en-US"
    },
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as TResponse) : undefined;

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

export function mapTokenToStoredCredentials(env: ApiEnv, token: EbayUserTokenResponse) {
  return toCredentialRecord(env, token);
}
