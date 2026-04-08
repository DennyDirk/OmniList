import { cookies } from "next/headers";

import { dictionaries, localeCookieName, resolveLocale } from "./i18n";

export async function getCurrentLocale() {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get(localeCookieName)?.value);
}

export async function getI18n() {
  const locale = await getCurrentLocale();
  return {
    locale,
    dictionary: dictionaries[locale]
  };
}
