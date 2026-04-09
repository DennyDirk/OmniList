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

export interface EbaySetupOption {
  id: string;
  label: string;
  detail?: string;
}

export interface EbaySellerSetupOptions {
  marketplaceId: string;
  merchantLocations: EbaySetupOption[];
  fulfillmentPolicies: EbaySetupOption[];
  paymentPolicies: EbaySetupOption[];
  returnPolicies: EbaySetupOption[];
}

export function hasRequiredEbayScopes(credentials: Record<string, string>, requiredScopes: string[]) {
  const grantedScopes = new Set(
    (credentials.scope ?? "")
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
  );

  return requiredScopes.every((scope) => grantedScopes.has(scope));
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

export async function callEbayAccountApi<TResponse>(
  env: ApiEnv,
  accessToken: string,
  input: {
    path: string;
    method: "GET";
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
    }
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as TResponse) : undefined;

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

function mapPolicyLabel(policy: {
  name?: string;
  description?: string;
  marketplaceId?: string;
}) {
  const title = policy.name?.trim() || "Unnamed policy";
  const details = [policy.description?.trim(), policy.marketplaceId?.trim()].filter(Boolean);
  return {
    label: title,
    detail: details.join(" · ")
  };
}

export async function getEbaySellerSetupOptions(
  env: ApiEnv,
  credentials: Record<string, string>,
  marketplaceId: string
) {
  const requiredScopes = [
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account.readonly"
  ];

  if (!hasRequiredEbayScopes(credentials, requiredScopes)) {
    throw new Error("EBAY_SETUP_RECONNECT_REQUIRED");
  }

  const auth = await ensureValidEbayAccessToken(env, credentials);

  const [locationsResponse, fulfillmentPoliciesResponse, paymentPoliciesResponse, returnPoliciesResponse] = await Promise.all([
    callEbayInventoryApi<{
      locations?: Array<{
        merchantLocationKey?: string;
        name?: string;
        location?: { address?: { city?: string; stateOrProvince?: string; country?: string } };
      }>;
      errors?: Array<{ message?: string }>;
    }>(env, auth.accessToken, {
      path: "/sell/inventory/v1/location",
      method: "GET"
    }),
    callEbayAccountApi<{
      fulfillmentPolicies?: Array<{
        fulfillmentPolicyId?: string;
        name?: string;
        description?: string;
        marketplaceId?: string;
      }>;
      errors?: Array<{ message?: string }>;
    }>(env, auth.accessToken, {
      path: `/sell/account/v1/fulfillment_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`,
      method: "GET"
    }),
    callEbayAccountApi<{
      paymentPolicies?: Array<{
        paymentPolicyId?: string;
        name?: string;
        description?: string;
        marketplaceId?: string;
      }>;
      errors?: Array<{ message?: string }>;
    }>(env, auth.accessToken, {
      path: `/sell/account/v1/payment_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`,
      method: "GET"
    }),
    callEbayAccountApi<{
      returnPolicies?: Array<{
        returnPolicyId?: string;
        name?: string;
        description?: string;
        marketplaceId?: string;
      }>;
      errors?: Array<{ message?: string }>;
    }>(env, auth.accessToken, {
      path: `/sell/account/v1/return_policy?marketplace_id=${encodeURIComponent(marketplaceId)}`,
      method: "GET"
    })
  ]);

  const firstError =
    locationsResponse.data?.errors?.[0]?.message ||
    fulfillmentPoliciesResponse.data?.errors?.[0]?.message ||
    paymentPoliciesResponse.data?.errors?.[0]?.message ||
    returnPoliciesResponse.data?.errors?.[0]?.message;

  if (!locationsResponse.ok || !fulfillmentPoliciesResponse.ok || !paymentPoliciesResponse.ok || !returnPoliciesResponse.ok) {
    const authErrorStatus = [locationsResponse.status, fulfillmentPoliciesResponse.status, paymentPoliciesResponse.status, returnPoliciesResponse.status].find(
      (status) => status === 401 || status === 403
    );

    if (authErrorStatus) {
      throw new Error("EBAY_SETUP_RECONNECT_REQUIRED");
    }

    throw new Error(firstError || "EBAY_SETUP_OPTIONS_FETCH_FAILED");
  }

  return {
    options: {
      marketplaceId,
      merchantLocations: (locationsResponse.data?.locations ?? [])
        .filter((location): location is NonNullable<typeof location> & { merchantLocationKey: string } => Boolean(location?.merchantLocationKey))
        .map((location) => {
          const address = location.location?.address;
          const addressLabel = [address?.city, address?.stateOrProvince, address?.country].filter(Boolean).join(", ");
          return {
            id: location.merchantLocationKey,
            label: location.name?.trim() || location.merchantLocationKey,
            detail: addressLabel || undefined
          };
        }),
      fulfillmentPolicies: (fulfillmentPoliciesResponse.data?.fulfillmentPolicies ?? [])
        .filter((policy): policy is NonNullable<typeof policy> & { fulfillmentPolicyId: string } => Boolean(policy?.fulfillmentPolicyId))
        .map((policy) => ({
          id: policy.fulfillmentPolicyId,
          ...mapPolicyLabel(policy)
        })),
      paymentPolicies: (paymentPoliciesResponse.data?.paymentPolicies ?? [])
        .filter((policy): policy is NonNullable<typeof policy> & { paymentPolicyId: string } => Boolean(policy?.paymentPolicyId))
        .map((policy) => ({
          id: policy.paymentPolicyId,
          ...mapPolicyLabel(policy)
        })),
      returnPolicies: (returnPoliciesResponse.data?.returnPolicies ?? [])
        .filter((policy): policy is NonNullable<typeof policy> & { returnPolicyId: string } => Boolean(policy?.returnPolicyId))
        .map((policy) => ({
          id: policy.returnPolicyId,
          ...mapPolicyLabel(policy)
        }))
    } satisfies EbaySellerSetupOptions,
    credentials: auth.credentials
  };
}

export function mapTokenToStoredCredentials(env: ApiEnv, token: EbayUserTokenResponse) {
  return toCredentialRecord(env, token);
}
