import Link from "next/link";
import { notFound } from "next/navigation";
import { getEffectiveProductForChannel } from "@omnilist/shared";
import { InventoryCard } from "../../../components/inventory-card";
import { PublishProductCard } from "../../../components/publish-product-card";
import { PublishJobRefresh } from "../../../components/publish-job-refresh";
import { PublishJobHistory } from "../../../components/publish-job-history";
import { requireAuthSession } from "../../../lib/auth";
import { getChannelConnections, getClientApiBaseUrl, getProduct, getProductInventory, getProductPublishJobs } from "../../../lib/api";
import { getI18n } from "../../../lib/i18n.server";
import { publishCopy } from "../../../lib/publish-copy";

export default async function ProductWorkspacePage({ params }: { params: Promise<{ productId: string }> }) {
  const { locale } = await getI18n();
  await requireAuthSession();
  const { productId } = await params;
  const [product, connections, jobs, inventory] = await Promise.all([
    getProduct(productId), getChannelConnections(), getProductPublishJobs(productId), getProductInventory(productId)
  ]);
  if (!product) notFound();
  const text = publishCopy[locale];
  const effective = getEffectiveProductForChannel(product, "ebay");
  const connection = connections.find(item => item.channelId === "ebay");
  const active = jobs.some(job => job.status === "queued" || job.status === "processing");
  const hasPublished = jobs.some(job => job.targets.some(target => target.channelId === "ebay" && target.status === "published"));

  return <main className="shell listing-shell">
    <PublishJobRefresh active={active} locale={locale} />
    <header className="listing-header">
      <Link className="text-link" href="/">{text.catalog}</Link>
      <h1>{product.title}</h1>
      <p className="muted">{text.review}</p>
    </header>
    <div className="listing-review-grid">
      <section className="card listing-preview" aria-label={text.basics}>
        {product.images[0] ? <img className="listing-cover" src={product.images[0].url} alt={product.images[0].altText || effective.title} /> : null}
        <h2>{effective.title}</h2>
        <div className="row"><strong className="listing-price">{new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(effective.basePrice)}</strong><span className="pill">{text.count}: {product.quantity}</span></div>
        <p className="listing-description">{effective.description}</p>
        <Link className="button-secondary" href={`/products/${product.id}/edit`}>{text.productFix}</Link>
        <details><summary>{text.optional}</summary><p className="field-hint">SKU: {product.sku}</p><p className="field-hint">eBay: {product.channelOverrides.ebay?.categoryId || "-"}</p></details>
      </section>
      <div className="listing-side">
        <PublishProductCard key={product.id + JSON.stringify(product.channelOverrides)} apiBaseUrl={getClientApiBaseUrl()} product={product} connection={connection} active={active} hasPublished={hasPublished} locale={locale} />
        <PublishJobHistory jobs={jobs} locale={locale} />
      </div>
    </div>
    <details className="card listing-stock"><summary>{text.stock}</summary><InventoryCard apiBaseUrl={getClientApiBaseUrl()} locale={locale} product={product} snapshot={inventory} /></details>
  </main>;
}
