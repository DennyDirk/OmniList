import type { Route } from "next";
import { redirect } from "next/navigation";

import { getAuthSession } from "./api";

const loginRoute = "/login" as Route;

export async function requireAuthSession() {
  const session = await getAuthSession();

  if (!session) {
    redirect(loginRoute);
  }

  return session;
}
