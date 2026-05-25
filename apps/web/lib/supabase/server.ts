import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseBrowserEnv } from "./env";

export async function createClient() {
  const env = getSupabaseBrowserEnv();
  if (!env) {
    return undefined;
  }

  const cookieStore = await cookies();

  return createServerClient(
    env.url,
    env.publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components can't always write cookies. The proxy handles refreshes.
          }
        }
      }
    }
  );
}
