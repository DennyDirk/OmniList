import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { InventoryCard } from "../../../components/inventory-card";
import { PublishProductCard } from "../../../components/publish-product-card";
import { requireAuthSession } from "../../../lib/auth";
import {
  getChannelConnections,
  getChannelDraftPreview,
  getClientApiBaseUrl,
  getProduct,
  getProductInventory,
  getProductPublishJobs
} from "../../../lib/api";
import { getBestCategoryLabel, getEffectiveProductForChannel } from "@omnilist/shared";
import { formatDateTime, formatPublishJobStatus, formatPublishTargetStatus, formatReadinessStatus } from "../../../lib/i18n";
import { getI18n } from "../../../lib/i18n.server";
import { getReadinessForAllChannels } from "../../../lib/readiness";

export default async function ProductWorkspacePage({
  params
}: {
  params: Promise<{ productId: string }>;
}) {
  const { dictionary, locale } = await getI18n();
  await requireAuthSession();
  const { productId } = await params;
  const [product, connections, publishJobs, inventory] = await Promise.all([
    getProduct(productId),
    getChannelConnections(),
    getProductPublishJobs(productId),
    getProductInventory(productId)
  ]);

  if (!product) {
    notFound();
  }

  const readinessItems = getReadinessForAllChannels(product);
  const ebayDraft = await getChannelDraftPreview(product.id, "ebay");
  const ebayConnection = connections.find((connection) => connection.channelId === "ebay");
  const ebayReadiness = readinessItems.find((item) => item.channel.id === "ebay")?.readiness;
  const editHref = `/products/${product.id}/edit` as Route;
  const channelsHref = "/channels" as Route;
  const ebayBlockingReason =
    ebayConnection?.status === "connected"
      ? ebayDraft?.missingConfiguration[0] ??
        (ebayReadiness?.status === "needs_attention"
          ? "Fix the blocking eBay readiness issues in this product before publishing."
          : undefined)
      : undefined;
  const ebayNextAction =
    ebayConnection?.status !== "connected"
      ? {
          href: channelsHref,
          label: "Open channel setup"
        }
      : ebayDraft?.missingConfiguration.length
        ? {
            href: channelsHref,
            label: "Finish eBay setup"
          }
        : ebayReadiness?.status === "needs_attention"
          ? {
              href: editHref,
              label: "Fix product data"
            }
          : undefined;

  return (
    <main className="shell">
      <section className="hero">
        <div className="hero-actions">
          <Link className="pill" href="/">
            {dictionary.common.backToDashboard}
          </Link>
          <Link className="cta secondary" href={editHref}>
            {dictionary.common.editProduct}
          </Link>
        </div>
        <h1>{product.title}</h1>
        <p>{dictionary.productWorkspace.description}</p>
      </section>

      <section className="grid readiness-grid">
        {readinessItems.map(({ channel, readiness }) => (
          <article className="card" key={channel.id}>
            {(() => {
              const effectiveProduct = getEffectiveProductForChannel(product, channel.id);

              return (
                <>
            <div className="row">
              <h2>{channel.name}</h2>
              <span className={`pill ${readiness.status === "ready" ? "ready" : "attention"}`}>
                {formatReadinessStatus(dictionary, readiness.status)}
              </span>
            </div>

            <p className="muted">{dictionary.channels.descriptions[channel.id]}</p>
            <div className="muted">{getBestCategoryLabel(product, channel.id) ?? dictionary.dashboard.categoryMappingMissing}</div>
            <div className="muted">{effectiveProduct.title}</div>
            <div className="muted">${effectiveProduct.basePrice}</div>
            <div className="score">{readiness.score}</div>
            <div className="muted">{dictionary.productWorkspace.readinessScore}</div>

            <div className="list" style={{ marginTop: 16 }}>
              {readiness.issues.length === 0 ? (
                <div className="issue suggestion">{dictionary.productWorkspace.listingReady}</div>
              ) : (
                readiness.issues.map((issue) => (
                  <div className={`issue ${issue.severity}`} key={issue.code}>
                    <strong>{issue.field}</strong>
                    <div>{issue.message}</div>
                  </div>
                ))
              )}
            </div>
                </>
              );
            })()}
          </article>
        ))}
      </section>

      <div className="section-title">
        <h2>{dictionary.common.publishing}</h2>
        <p>{dictionary.productWorkspace.publishingDescription}</p>
      </div>

      <section className="grid product-grid">
        <InventoryCard
          apiBaseUrl={getClientApiBaseUrl()}
          locale={locale}
          product={product}
          snapshot={inventory}
        />

        <PublishProductCard
          apiBaseUrl={getClientApiBaseUrl()}
          blockingReasons={ebayBlockingReason ? { ebay: ebayBlockingReason } : undefined}
          connections={connections}
          locale={locale}
          productId={product.id}
        />

        <article className="card">
          <h3>{dictionary.common.recentJobs}</h3>
          <div className="list">
            {publishJobs.length === 0 ? (
              <div className="list-item">{dictionary.productWorkspace.noProductJobs}</div>
            ) : (
              publishJobs.map((job) => (
                <div className="list-item" key={job.id}>
                  <div className="row">
                    <strong>{formatPublishJobStatus(dictionary, job.status)}</strong>
                    <span className="muted">{formatDateTime(job.createdAt, locale)}</span>
                  </div>
                  <div className="list compact-list">
                    {job.targets.map((target) => (
                      <div className="publish-target" key={target.id}>
                        <span>{target.channelName}</span>
                        <span
                          className={`pill ${
                            target.status === "published" ? "ready" : target.status === "failed" ? "attention" : ""
                          }`}
                        >
                          {formatPublishTargetStatus(dictionary, target.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        {ebayDraft ? (
          <article className="card">
            <h3>First eBay publish</h3>
            <p className="muted">
              Move through these steps once, then this product can be published to eBay in one click.
            </p>
            <div className="list" style={{ marginTop: 16 }}>
              <div className={`issue ${ebayConnection?.status === "connected" ? "suggestion" : "warning"}`}>
                <strong>1. eBay account</strong>
                <div>
                  {ebayConnection?.status === "connected"
                    ? `Connected as ${ebayConnection.externalAccountId ?? "eBay seller"}.`
                    : "Connect the eBay seller account first."}
                </div>
              </div>
              <div className={`issue ${ebayDraft.missingConfiguration.length === 0 ? "suggestion" : "warning"}`}>
                <strong>2. eBay selling setup</strong>
                <div>
                  {ebayDraft.missingConfiguration.length === 0
                    ? "Merchant location and business policy prerequisites are filled in."
                    : ebayDraft.missingConfiguration[0]}
                </div>
              </div>
              <div className={`issue ${ebayReadiness?.status === "ready" ? "suggestion" : "warning"}`}>
                <strong>3. Product readiness</strong>
                <div>
                  {ebayReadiness?.status === "ready"
                    ? "This product is ready for eBay validation rules."
                    : "Fix the blocking product issues in the eBay readiness card above."}
                </div>
              </div>
              <div
                className={`issue ${
                  ebayConnection?.status === "connected" &&
                  ebayDraft.missingConfiguration.length === 0 &&
                  ebayReadiness?.status === "ready"
                    ? "suggestion"
                    : "warning"
                }`}
              >
                <strong>4. Publish</strong>
                <div>
                  {ebayConnection?.status === "connected" &&
                  ebayDraft.missingConfiguration.length === 0 &&
                  ebayReadiness?.status === "ready"
                    ? "Use the publish card to send this product to eBay."
                    : "Finish the steps above and the publish action will unlock automatically."}
                </div>
              </div>
            </div>
            {ebayNextAction ? (
              <div className="editor-actions">
                <Link className="button-primary" href={ebayNextAction.href}>
                  {ebayNextAction.label}
                </Link>
              </div>
            ) : null}
          </article>
        ) : null}

        {ebayDraft ? (
          <article className="card">
            <h3>eBay listing draft</h3>
            <div className="list">
              <div className="list-item">Title: {ebayDraft.title}</div>
              <div className="list-item">Price: ${ebayDraft.price}</div>
              <div className="list-item">Category: {ebayDraft.categoryLabel ?? "Unmapped category"}</div>
              <div className="list-item">Format: {ebayDraft.listingFormat ?? "N/A"}</div>
            </div>
            <div className="list" style={{ marginTop: 16 }}>
              {ebayDraft.missingConfiguration.length === 0 ? (
                <div className="issue suggestion">Draft prerequisites are satisfied for the current eBay connection.</div>
              ) : (
                ebayDraft.missingConfiguration.map((issue) => (
                  <div className="issue warning" key={issue}>
                    {issue}
                  </div>
                ))
              )}
            </div>
          </article>
        ) : null}
      </section>

      <div className="section-title">
        <h2>{dictionary.common.canonicalProductModel}</h2>
        <p>{dictionary.productWorkspace.canonicalDescription}</p>
      </div>

      <section className="grid product-grid">
        <article className="card">
          <h3>{dictionary.productWorkspace.coreFields}</h3>
          <div className="list">
            <div className="list-item">{dictionary.common.skuLabel}: {product.sku}</div>
            <div className="list-item">{dictionary.productWorkspace.basePrice}: ${product.basePrice}</div>
            <div className="list-item">{dictionary.productWorkspace.stock}: {product.quantity}</div>
            <div className="list-item">{dictionary.productWorkspace.category}: {product.categoryLabel ?? dictionary.productWorkspace.notMappedYet}</div>
          </div>
        </article>

        <article className="card">
          <h3>{dictionary.productWorkspace.attributes}</h3>
          <div className="list">
            {Object.keys(product.attributes).length === 0 ? (
              <div className="list-item">{dictionary.productWorkspace.noAttributes}</div>
            ) : (
              Object.entries(product.attributes).map(([key, value]) => (
                <div className="list-item" key={key}>
                  {key}: {value}
                </div>
              ))
            )}
          </div>
        </article>

        <article className="card">
          <h3>{dictionary.productWorkspace.variants}</h3>
          <div className="list">
            {product.variants.length === 0 ? (
              <div className="list-item">{dictionary.productWorkspace.noVariants}</div>
            ) : (
              product.variants.map((variant) => (
                <div className="list-item" key={variant.id}>
                  <div><strong>{variant.sku}</strong> | ${variant.price} | {variant.quantity} {dictionary.productWorkspace.units}</div>
                  {variant.options.length > 0 ? (
                    <div className="muted">
                      {variant.options.map((option) => `${option.name}: ${option.value}`).join(" • ")}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
