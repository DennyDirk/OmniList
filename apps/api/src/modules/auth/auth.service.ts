import { scryptSync } from "node:crypto";
import type { AuthProvider, AuthProviderId, AuthSession, LoginInput, RegisterInput } from "@omnilist/shared";

import type { ApiEnv } from "../../config/env";
import type { AuthRepository } from "./auth.repository";

export const SESSION_COOKIE_NAME = "omnilist_session";
export const OAUTH_STATE_COOKIE_NAME = "omnilist_oauth_state";

interface OAuthStartResult {
  authorizationUrl: string;
  state: string;
}

interface OAuthProviderConfig extends AuthProvider {
  clientId?: string;
  clientSecret?: string;
}

interface EnabledOAuthProviderConfig extends AuthProvider {
  clientId: string;
  clientSecret: string;
}

function hashPassword(password: string) {
  const salt = "omnilist-dev-salt";
  return scryptSync(password, salt, 64).toString("hex");
}

function buildOAuthProviders(env: ApiEnv): Record<AuthProviderId, OAuthProviderConfig> {
  return {
    google: {
      id: "google",
      name: "Google",
      enabled: Boolean(env.googleClientId && env.googleClientSecret),
      clientId: env.googleClientId,
      clientSecret: env.googleClientSecret
    },
    facebook: {
      id: "facebook",
      name: "Facebook",
      enabled: Boolean(env.facebookClientId && env.facebookClientSecret),
      clientId: env.facebookClientId,
      clientSecret: env.facebookClientSecret
    }
  };
}

function createState(provider: AuthProviderId) {
  return `${provider}:${crypto.randomUUID()}`;
}

export function createAuthService(env: ApiEnv, repository: AuthRepository) {
  const providers = buildOAuthProviders(env);

  function getProviderConfig(provider: AuthProviderId): EnabledOAuthProviderConfig {
    const config = providers[provider];

    if (!config || !config.enabled || !config.clientId || !config.clientSecret) {
      throw new Error("PROVIDER_NOT_CONFIGURED");
    }

    return {
      id: config.id,
      name: config.name,
      enabled: true,
      clientId: config.clientId,
      clientSecret: config.clientSecret
    };
  }

  async function exchangeGoogleCode(code: string) {
    const config = getProviderConfig("google");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${env.publicApiUrl}/auth/oauth/google/callback`
      })
    });

    if (!tokenResponse.ok) {
      throw new Error("OAUTH_TOKEN_EXCHANGE_FAILED");
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`
      }
    });

    if (!profileResponse.ok) {
      throw new Error("OAUTH_PROFILE_FETCH_FAILED");
    }

    const profile = (await profileResponse.json()) as {
      sub: string;
      email: string;
      name: string;
    };

    return {
      provider: "google" as const,
      providerAccountId: profile.sub,
      email: profile.email,
      name: profile.name
    };
  }

  async function exchangeFacebookCode(code: string) {
    const config = getProviderConfig("facebook");
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", config.clientId);
    tokenUrl.searchParams.set("client_secret", config.clientSecret);
    tokenUrl.searchParams.set("redirect_uri", `${env.publicApiUrl}/auth/oauth/facebook/callback`);
    tokenUrl.searchParams.set("code", code);

    const tokenResponse = await fetch(tokenUrl);

    if (!tokenResponse.ok) {
      throw new Error("OAUTH_TOKEN_EXCHANGE_FAILED");
    }

    const tokenData = (await tokenResponse.json()) as { access_token: string };
    const profileUrl = new URL("https://graph.facebook.com/me");
    profileUrl.searchParams.set("fields", "id,name,email");
    profileUrl.searchParams.set("access_token", tokenData.access_token);

    const profileResponse = await fetch(profileUrl);

    if (!profileResponse.ok) {
      throw new Error("OAUTH_PROFILE_FETCH_FAILED");
    }

    const profile = (await profileResponse.json()) as {
      id: string;
      email?: string;
      name: string;
    };

    if (!profile.email) {
      throw new Error("OAUTH_EMAIL_REQUIRED");
    }

    return {
      provider: "facebook" as const,
      providerAccountId: profile.id,
      email: profile.email,
      name: profile.name
    };
  }

  return {
    listProviders(): AuthProvider[] {
      return Object.values(providers).map(({ id, name, enabled }) => ({
        id,
        name,
        enabled
      }));
    },
    async register(input: RegisterInput) {
      const passwordHash = hashPassword(input.password);
      return repository.createUserWithSession(input, passwordHash);
    },
    async login(input: LoginInput) {
      const normalizedEmail = input.email.trim().toLowerCase();
      return repository.createSessionForCredentials(normalizedEmail, hashPassword(input.password));
    },
    async getSession(token: string | undefined): Promise<AuthSession | undefined> {
      if (!token) {
        return undefined;
      }

      return repository.getSession(token);
    },
    async logout(token: string | undefined) {
      if (!token) {
        return;
      }

      await repository.deleteSession(token);
    },
    beginOAuth(provider: AuthProviderId): OAuthStartResult {
      const config = getProviderConfig(provider);
      const state = createState(provider);

      if (provider === "google") {
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.searchParams.set("client_id", config.clientId);
        url.searchParams.set("redirect_uri", `${env.publicApiUrl}/auth/oauth/google/callback`);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", "openid email profile");
        url.searchParams.set("state", state);
        url.searchParams.set("prompt", "select_account");

        return {
          authorizationUrl: url.toString(),
          state
        };
      }

      const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", `${env.publicApiUrl}/auth/oauth/facebook/callback`);
      url.searchParams.set("state", state);
      url.searchParams.set("scope", "email,public_profile");

      return {
        authorizationUrl: url.toString(),
        state
      };
    },
    async finishOAuth(provider: AuthProviderId, code: string, state: string, expectedState?: string) {
      if (!expectedState || expectedState !== state) {
        throw new Error("INVALID_OAUTH_STATE");
      }

      const profile =
        provider === "google" ? await exchangeGoogleCode(code) : await exchangeFacebookCode(code);

      return repository.getOrCreateUserFromOAuth(profile);
    },
    getWebRedirectUrl() {
      return env.publicWebUrl;
    }
  };
}
