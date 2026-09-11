import Link from "next/link";
import { BulkPublishCard } from "../components/bulk-publish-card";
import { PublishJobRefresh } from "../components/publish-job-refresh";
import { PublishJobHistory } from "../components/publish-job-history";
import { LogoutButton } from "../components/logout-button";
import { requireAuthSession } from "../lib/auth";
import { getChannelConnections, getClientApiBaseUrl, getProducts, getPublishJobs } from "../lib/api";
import { formatConnectionStatus, formatPublishJobStatus } from "../lib/i18n";
import { getI18n } from "../lib/i18n.server";
import { publishCopy } from "../lib/publish-copy";

export default async function DashboardPage() {
  const { dictionary, locale } = await getI18n();
  const session = await requireAuthSession();
  const [products, connections, jobs] = await Promise.all([getProducts(), getChannelConnections(), getPublishJobs()]);
  const text = publishCopy[locale];
  const ebay = connections.find(item => item.channelId === "ebay");
  const orderedJobs = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <main className="shell listing-shell">
    <PublishJobRefresh active={jobs.some(job => job.status === "queued" || job.status === "processing")} locale={locale} />
    <header className="listing-header">
      <div className="row"><h1>{text.catalog} <span className="pill">{products.length}</span></h1><Link className="button-primary" href="/products/new">{text.create}</Link></div>
      <div className="row listing-store-bar"><span>eBay / {formatConnectionStatus(dictionary, ebay?.status ?? "disconnected")}{ebay?.metadata.environment === "sandbox" ? " / Sandbox" : ""}</span><Link className="text-link" href="/channels">{text.storeFix}</Link></div>
    </header>
    <section className="listing-catalog" aria-label={text.catalog}>
      {!products.length ? <article className="card"><h2>{dictionary.common.addFirstProduct}</h2><p className="muted">{text.basicsHint}</p><Link className="button-primary" href="/products/new">{text.create}</Link></article> : null}
      {products.map(product => {
        const latest = orderedJobs.find(job => job.productId === product.id);
        return <article className="card catalog-item" key={product.id}>
          {product.images[0] ? <img src={product.images[0].url} alt={product.images[0].altText || product.title} /> : <div className="catalog-placeholder" aria-hidden="true">OmniList</div>}
          <div><h2><Link href={`/products/${product.id}`}>{product.title}</Link></h2><p className="muted">{new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(product.basePrice)} / {text.count}: {product.quantity}</p><span className="pill">{latest ? text.result + ": " + formatPublishJobStatus(dictionary, latest.status) : text.draft}</span></div>
          <Link className="button-secondary" href={`/products/${product.id}`}>{text.open}</Link>
        </article>;
      })}
    </section>
    {products.length > 1 ? <details className="card listing-stock"><summary>{dictionary.dashboard.publishCenterTitle}</summary><p className="field-hint">{text.checkHint}</p><BulkPublishCard apiBaseUrl={getClientApiBaseUrl()} products={products} connections={connections.filter(item => item.channelId === "ebay")} locale={locale} /></details> : null}
    {jobs.length ? <details className="listing-stock"><summary>{text.history}</summary><PublishJobHistory jobs={jobs} locale={locale} /></details> : null}
    <footer className="listing-account"><span className="field-hint">{session.user.email}</span><Link className="text-link" href="/billing">{dictionary.common.managePlan}</Link><LogoutButton locale={locale} /></footer>
  </main>;
}
