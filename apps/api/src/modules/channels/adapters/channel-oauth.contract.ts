export interface ChannelOAuthCompletionResult {
  externalAccountId: string;
  publicMetadata: Record<string, string>;
  credentials: Record<string, string>;
}

// Provider-specific authorization attempts will extend this before Etsy/Shopify integration.
export interface ChannelOAuthAdapter {
  providerLabel: string;
  isConfigured(): boolean;
  beginConnection(state: string): string;
  completeConnection(code: string): Promise<ChannelOAuthCompletionResult>;
}
