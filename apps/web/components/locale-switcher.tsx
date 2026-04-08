"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { localeCookieName, locales, type Locale } from "../lib/i18n";

interface LocaleSwitcherProps {
  currentLocale: Locale;
  label: string;
  localeNames: Record<Locale, string>;
}

export function LocaleSwitcher({ currentLocale, label, localeNames }: LocaleSwitcherProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(nextLocale: Locale) {
    document.cookie = `${localeCookieName}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="locale-switcher">
      <label className="field">
        <span>{label}</span>
        <select disabled={isPending} onChange={(event) => handleChange(event.target.value as Locale)} value={currentLocale}>
          {locales.map((locale) => (
            <option key={locale} value={locale}>
              {localeNames[locale]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
