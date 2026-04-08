"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { dictionaries, type Locale } from "../lib/i18n";

const loginRoute = "/login" as Route;

interface LogoutButtonProps {
  apiBaseUrl: string;
  locale: Locale;
}

export function LogoutButton({ apiBaseUrl, locale }: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const dictionary = dictionaries[locale];

  async function handleLogout() {
    if (!apiBaseUrl) {
      router.push(loginRoute);
      return;
    }

    await fetch(`${apiBaseUrl}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });

    startTransition(() => {
      router.push(loginRoute);
      router.refresh();
    });
  }

  return (
    <button className="cta secondary button-reset" disabled={isPending} onClick={handleLogout} type="button">
      {isPending ? dictionary.logoutButton.signingOut : dictionary.logoutButton.signOut}
    </button>
  );
}
