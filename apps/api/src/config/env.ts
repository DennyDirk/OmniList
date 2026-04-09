export interface ApiEnv {
  databaseUrl?: string;
  nodeEnv: string;
  port: number;
  publicApiUrl: string;
  publicWebUrl: string;
  googleClientId?: string;
  googleClientSecret?: string;
  facebookClientId?: string;
  facebookClientSecret?: string;
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

  return {
    databaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV ?? "development",
    port,
    publicApiUrl: process.env.OMNILIST_API_URL ?? `http://localhost:${port}`,
    publicWebUrl: process.env.OMNILIST_WEB_URL ?? "http://localhost:3000",
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    facebookClientId: process.env.FACEBOOK_CLIENT_ID,
    facebookClientSecret: process.env.FACEBOOK_CLIENT_SECRET,
    ebayClientId: process.env.EBAY_CLIENT_ID,
    ebayClientSecret: process.env.EBAY_CLIENT_SECRET,
    ebayRedirectUriName: process.env.EBAY_REDIRECT_URI_NAME,
    ebayEnvironment: process.env.EBAY_ENVIRONMENT === "production" ? "production" : "sandbox",
    ebayScopes: (process.env.EBAY_SCOPES ?? "https://api.ebay.com/oauth/api_scope/sell.inventory")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean),
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "product-images"
  };
}
