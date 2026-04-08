import type { Route } from "next";
import Link from "next/link";

import { ProductEditor } from "../../../components/product-editor";
import { requireAuthSession } from "../../../lib/auth";
import { getClientApiBaseUrl, getWorkspaceUsage } from "../../../lib/api";
import { getI18n } from "../../../lib/i18n.server";

export default async function NewProductPage() {
  const { dictionary, locale } = await getI18n();
  await requireAuthSession();
  const usage = await getWorkspaceUsage();
  const hasReachedProductLimit = usage ? usage.productLimit !== null && usage.productCount >= usage.productLimit : false;

  return (
    <main className="shell">
      <section className="hero">
        <Link className="pill" href="/">
          {dictionary.common.backToDashboard}
        </Link>
        <h1>{dictionary.newProductPage.title}</h1>
        <p>{dictionary.newProductPage.description}</p>
      </section>

      {hasReachedProductLimit && usage ? (
        <section className="card" style={{ marginTop: 24 }}>
          <div className="section-title">
            <h2>Free plan limit reached</h2>
            <p>Upgrade to Pro to keep adding products without interrupting the catalog creation flow.</p>
          </div>
          <div className="list">
            <div className="list-item">{dictionary.billingPage.productUsage(usage.productCount, usage.productLimit)}</div>
          </div>
          <div className="hero-actions" style={{ marginTop: 24 }}>
            <Link className="cta" href={"/billing" as Route}>
              {dictionary.common.upgradeToPro}
            </Link>
            <Link className="cta secondary" href="/">
              {dictionary.common.backToDashboard}
            </Link>
          </div>
        </section>
      ) : (
        <section className="card" style={{ marginTop: 24 }}>
          <ProductEditor apiBaseUrl={getClientApiBaseUrl()} locale={locale} />
        </section>
      )}
    </main>
  );
}
