"use client";

import { useMemo } from "react";

import { dictionaries, type Locale } from "../lib/i18n";
import { createClient } from "../lib/supabase/client";
import { useFlash } from "./flash-provider";

interface SocialAuthButtonsProps {
  locale: Locale;
}

const providers = [
  { id: "google", name: "Google" },
  { id: "facebook", name: "Facebook" }
] as const;

export function SocialAuthButtons({ locale }: SocialAuthButtonsProps) {
  const dictionary = dictionaries[locale];
  const supabase = useMemo(() => createClient(), []);
  const { showFlash } = useFlash();

  async function handleOAuth(provider: "google" | "facebook") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) {
      showFlash({
        tone: "error",
        message: error.message
      });
    }
  }

  return (
    <div className="social-list">
      {providers.map((provider) => (
        <button className="social-button" key={provider.id} onClick={() => void handleOAuth(provider.id)} type="button">
          {dictionary.socialAuth.continueWith(provider.name)}
        </button>
      ))}
    </div>
  );
}
