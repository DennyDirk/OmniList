export interface ApiEnv {
  databaseUrl?: string;
  nodeEnv: string;
  port: number;
  publicApiUrl: string;
  publicWebUrl: string;
  ebayClientId?: string;
  ebayClientSecret?: string;
  ebayRedirectUriName?: string;
  ebayEnvironment: "sandbox" | "production";
  ebayScopes: string[];
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  supabaseStorageBucket: string;
}

export function getEnv(): ApiEnv {
  const port = Number(process.env.PORT ?? 4000);
  const defaultEbayScopes = [
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
    "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly"
  ];
  const configuredEbayScopes = (process.env.EBAY_SCOPES ?? "")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

  return {
    databaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV ?? "development",
    port,
    publicApiUrl: process.env.OMNILIST_API_URL ?? `http://localhost:${port}`,
    publicWebUrl: process.env.OMNILIST_WEB_URL ?? "http://localhost:3000",
    ebayClientId: process.env.EBAY_CLIENT_ID,
    ebayClientSecret: process.env.EBAY_CLIENT_SECRET,
    ebayRedirectUriName: process.env.EBAY_REDIRECT_URI_NAME,
    ebayEnvironment: process.env.EBAY_ENVIRONMENT === "production" ? "production" : "sandbox",
    ebayScopes: [...new Set([...defaultEbayScopes, ...configuredEbayScopes])],
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "product-images"
  };
}
