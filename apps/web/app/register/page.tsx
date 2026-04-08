import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthForm } from "../../components/auth-form";
import { SocialAuthButtons } from "../../components/social-auth-buttons";
import { getAuthProviders, getClientApiBaseUrl, getAuthSession } from "../../lib/api";
import { getI18n } from "../../lib/i18n.server";

export default async function RegisterPage() {
  const homeRoute = "/" as Route;
  const loginRoute = "/login" as Route;
  const { dictionary, locale } = await getI18n();
  const [session, providers] = await Promise.all([getAuthSession(), getAuthProviders()]);

  if (session) {
    redirect(homeRoute);
  }

  return (
    <main className="shell auth-shell">
      <section className="hero">
        <span className="eyebrow">{dictionary.common.account}</span>
        <h1>{dictionary.registerPage.title}</h1>
        <p>{dictionary.registerPage.description}</p>
      </section>

      <section className="card auth-wrap">
        <AuthForm apiBaseUrl={getClientApiBaseUrl()} locale={locale} mode="register" />
        <div className="auth-divider">{dictionary.common.or}</div>
        <SocialAuthButtons apiBaseUrl={getClientApiBaseUrl()} locale={locale} providers={providers} />
        <p className="muted">
          {dictionary.registerPage.alreadyHaveAccount} <Link href={loginRoute}>{dictionary.registerPage.signIn}</Link>
        </p>
      </section>
    </main>
  );
}
