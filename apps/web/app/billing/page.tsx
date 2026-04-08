import Link from "next/link";

import { BillingPlanCard } from "../../components/billing-plan-card";
import { requireAuthSession } from "../../lib/auth";
import { getClientApiBaseUrl, getWorkspaceUsage } from "../../lib/api";
import { getI18n } from "../../lib/i18n.server";

export default async function BillingPage() {
  const { dictionary, locale } = await getI18n();
  const session = await requireAuthSession();
  const usage = await getWorkspaceUsage();
  const currentPlanLabel = session.workspace.subscriptionPlan === "pro" ? "Pro" : "Free";

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">{dictionary.billingPage.eyebrow}</span>
        <h1>{dictionary.billingPage.title}</h1>
        <p>{dictionary.billingPage.description}</p>
        <div className="hero-actions">
          <span className="pill">
            {dictionary.common.currentPlan}: {currentPlanLabel}
          </span>
          <Link className="cta secondary" href="/">
            {dictionary.common.backToDashboard}
          </Link>
        </div>
      </section>

      {usage ? (
        <>
          <div className="section-title">
            <h2>{dictionary.billingPage.currentUsage}</h2>
            <p>{dictionary.billingPage.productUsage(usage.productCount, usage.productLimit)}</p>
          </div>

          <BillingPlanCard
            apiBaseUrl={getClientApiBaseUrl()}
            currentPlan={usage.subscriptionPlan}
            locale={locale}
            usage={usage}
          />
        </>
      ) : null}
    </main>
  );
}
