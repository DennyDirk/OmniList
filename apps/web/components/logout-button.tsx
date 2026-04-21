"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useMemo, useTransition } from "react";

import { dictionaries, type Locale } from "../lib/i18n";
import { createClient } from "../lib/supabase/client";

const loginRoute = "/login" as Route;

interface LogoutButtonProps {
  locale: Locale;
}

export function LogoutButton({ locale }: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const dictionary = dictionaries[locale];
  const supabase = useMemo(() => createClient(), []);

  async function handleLogout() {
    await supabase.auth.signOut();

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
