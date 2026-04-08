import type { Route } from "next";
import Link from "next/link";

import { BulkPublishCard } from "../components/bulk-publish-card";
import { LogoutButton } from "../components/logout-button";
import { requireAuthSession } from "../lib/auth";
import {
  getChannelConnections,
  getChannels,
  getClientApiBaseUrl,
  getProducts,
  getPublishJobs,
  getWorkspace,
  getWorkspaceUsage
} from "../lib/api";
import { formatConnectionStatus, formatDateTime, formatPublishJobStatus, formatPublishTargetStatus } from "../lib/i18n";
import { getI18n } from "../lib/i18n.server";
import { getReadinessForAllChannels } from "../lib/readiness";

export default async function DashboardPage() {
  const { dictionary, locale } = await getI18n();
  const session = await requireAuthSession();
  const [products, channels, workspace, connections, publishJobs, workspaceUsage] = await Promise.all([
    getProducts(),
    getChannels(),
    getWorkspace(),
    getChannelConnections(),
    getPublishJobs(),
    getWorkspaceUsage()
  ]);

  const readinessSummary = products.map((product) => ({
    product,
    items: getReadinessForAllChannels(product)
  }));

  const readyListings = readinessSummary
    .flatMap((entry) => entry.items)
    .filter((entry) => entry.readiness.status === "ready").length;

  const attentionListings = readinessSummary
    .flatMap((entry) => entry.items)
    .filter((entry) => entry.readiness.status === "needs_attention").length;

  const connectedChannels = connections.filter((item) => item.status === "connected").length;
  const currentPlanLabel = session.workspace.subscriptionPlan === "pro" ? "Pro" : "Free";
  const productsRemainingLabel =
    workspaceUsage?.productsRemaining === null ? "Unlimited" : String(workspaceUsage?.productsRemaining ?? 0);

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">{dictionary.dashboard.eyebrow}</span>
        <h1>{dictionary.dashboard.title}</h1>
        <p>{dictionary.dashboard.description(workspace?.name ?? session.workspace.name)}</p>
        <div className="hero-actions">
          <span className="pill">{dictionary.dashboard.signedInAs(session.user.email)}</span>
          <span className="pill">
            {dictionary.common.currentPlan}: {currentPlanLabel}
          </span>
          <Link className="cta secondary" href="/channels">
            {dictionary.common.manageChannels}
          </Link>
          <Link className="cta secondary" href={"/billing" as Route}>
            {dictionary.common.managePlan}
          </Link>
          <Link className="cta" href="/products/new">
            {dictionary.common.createProduct}
          </Link>
          <LogoutButton apiBaseUrl={getClientApiBaseUrl()} locale={locale} />
        </div>
      </section>

      <section className="grid stats">
        <article className="card">
          <div className="stat-label">{dictionary.dashboard.stats.productsInCatalog}</div>
          <div className="stat-value">{products.length}</div>
        </article>
        <article className="card">
          <div className="stat-label">{dictionary.dashboard.stats.connectedChannels}</div>
          <div className="stat-value">{connectedChannels}</div>
        </article>
        <article className="card">
          <div className="stat-label">{dictionary.dashboard.stats.listingsReadyNow}</div>
          <div className="stat-value">{readyListings}</div>
        </article>
        <article className="card">
          <div className="stat-label">{dictionary.dashboard.stats.productsRemaining}</div>
          <div className="stat-value">{productsRemainingLabel}</div>
        </article>
        <article className="card">
          <div className="stat-label">{dictionary.dashboard.stats.listingsNeedingAttention}</div>
          <div className="stat-value">{attentionListings}</div>
        </article>
      </section>

      <div className="section-title">
        <h2>{dictionary.dashboard.channelWorkspaceTitle}</h2>
        <p>{dictionary.dashboard.channelWorkspaceDescription}</p>
      </div>

      <section className="grid product-grid">
        {channels.map((channel) => {
          const connection = connections.find((item) => item.channelId === channel.id);
          const status = connection?.status ?? "disconnected";

          return (
            <article className="card" key={channel.id}>
              <div className="row">
                <h3>{channel.name}</h3>
                <span
                  className={`pill ${
                    status === "connected" ? "ready" : status === "attention_required" ? "attention" : ""
                  }`}
                >
                  {formatConnectionStatus(dictionary, status)}
                </span>
              </div>
              <p className="muted">{dictionary.channels.descriptions[channel.id]}</p>
              <div className="list">
                <div className="list-item">
                  {dictionary.common.type}: {dictionary.channels.kindLabels[channel.kind]}
                </div>
                <div className="list-item">
                  {dictionary.common.region}: {channel.region}
                </div>
                <div className="list-item">
                  {dictionary.common.accountLabel}: {connection?.externalAccountId ?? dictionary.common.notConnectedYet}
                </div>
              </div>
              <Link className="cta secondary" href="/channels">
                {dictionary.dashboard.manageChannel(channel.name)}
              </Link>
            </article>
          );
        })}
      </section>

      <div className="section-title">
        <h2>{dictionary.dashboard.catalogSnapshotTitle}</h2>
        <p>{dictionary.dashboard.catalogSnapshotDescription}</p>
      </div>

      <section className="grid product-grid">
        {products.length === 0 ? (
          <article className="card">
            <h3>{dictionary.dashboard.workspaceReadyTitle}</h3>
            <p className="muted">{dictionary.dashboard.workspaceReadyDescription}</p>
            <Link className="cta" href="/products/new">
              {dictionary.common.addFirstProduct}
            </Link>
          </article>
        ) : null}
        {readinessSummary.map(({ product, items }) => {
          const blockedCount = items.filter((item) => item.readiness.status === "needs_attention").length;

          return (
            <article className="card" key={product.id}>
              <div className="row">
                <h3>{product.title}</h3>
                <span className={`pill ${blockedCount === 0 ? "ready" : "attention"}`}>
                  {blockedCount === 0 ? dictionary.dashboard.readyEverywhere : dictionary.dashboard.channelsBlocked(blockedCount)}
                </span>
              </div>

              <p className="muted">{product.categoryLabel ?? dictionary.dashboard.categoryMappingMissing}</p>

              <div className="meta">
                <span className="pill">
                  {dictionary.common.skuLabel} {product.sku}
                </span>
                <span className="pill">${product.basePrice}</span>
                <span className="pill">
                  {product.quantity} {dictionary.common.inStock}
                </span>
              </div>

              <div className="list">
                {items.map(({ channel, readiness }) => (
                  <div className="list-item" key={channel.id}>
                    <div className="row">
                      <strong>{channel.name}</strong>
                      <span className={`pill ${readiness.status === "ready" ? "ready" : "attention"}`}>
                        {dictionary.common.score} {readiness.score}
                      </span>
                    </div>
                    <div className="muted">
                      {readiness.issues.length === 0
                        ? dictionary.dashboard.noIssuesDetected
                        : dictionary.dashboard.issuesToReview(readiness.issues.length)}
                    </div>
                  </div>
                ))}
              </div>

              <Link className="cta" href={`/products/${product.id}`}>
                {dictionary.common.openProductWorkspace}
              </Link>
            </article>
          );
        })}
      </section>

      <div className="section-title">
        <h2>{dictionary.dashboard.publishCenterTitle}</h2>
        <p>{dictionary.dashboard.publishCenterDescription}</p>
      </div>

      <section className="grid product-grid">
        <BulkPublishCard
          apiBaseUrl={getClientApiBaseUrl()}
          connections={connections}
          locale={locale}
          products={products}
        />

        <article className="card">
          <h3>{dictionary.common.recentJobs}</h3>
          <div className="list">
            {publishJobs.length === 0 ? (
              <div className="list-item">{dictionary.dashboard.noPublishJobs}</div>
            ) : (
              publishJobs.slice(0, 6).map((job) => (
                <div className="list-item" key={job.id}>
                  <div className="row">
                    <strong>{job.productTitle}</strong>
                    <span className="pill">{formatPublishJobStatus(dictionary, job.status)}</span>
                  </div>
                  <div className="muted">{formatDateTime(job.createdAt, locale)}</div>
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
      </section>
    </main>
  );
}
