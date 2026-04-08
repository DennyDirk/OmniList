"use client";

import type { AuthProvider } from "@omnilist/shared";

import { dictionaries, type Locale } from "../lib/i18n";

interface SocialAuthButtonsProps {
  apiBaseUrl: string;
  providers: AuthProvider[];
  locale: Locale;
}

export function SocialAuthButtons({ apiBaseUrl, providers, locale }: SocialAuthButtonsProps) {
  const dictionary = dictionaries[locale];

  return (
    <div className="social-list">
      {providers.map((provider) => {
        const href = `${apiBaseUrl}/auth/oauth/${provider.id}/start`;

        return provider.enabled ? (
          <a className="social-button" href={href} key={provider.id}>
            {dictionary.socialAuth.continueWith(provider.name)}
          </a>
        ) : (
          <div className="social-button disabled" key={provider.id}>
            {dictionary.socialAuth.notConfigured(provider.name)}
          </div>
        );
      })}
    </div>
  );
}
