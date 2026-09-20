"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { canPublishAssessment, type ChannelConnection, type Product, type UnifiedAssessment } from "@omnilist/shared";
import type { Locale } from "../lib/i18n";
import { assessmentCopy } from "../lib/assessment-copy";
import { bulkPublishCopy } from "../lib/bulk-publish-copy";
import { publishCopy } from "../lib/publish-copy";
import { publishFlowCopy } from "../lib/publish-flow-copy";
import { PublishReviewError, readPublishAssessment } from "../lib/publish-review";
import { EbayPublishPreview } from "./ebay-publish-preview";
import { useFlash } from "./flash-provider";

type Review = { assessment?: UnifiedAssessment; error?: string };

export function BulkPublishCard({ apiBaseUrl, products, connections, activeProductIds, locale }: {
  apiBaseUrl: string; products: Product[]; connections: ChannelConnection[]; activeProductIds: string[]; locale: Locale;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const { showFlash } = useFlash();
  const text = bulkPublishCopy[locale];
  const checks = assessmentCopy[locale];
  const store = publishCopy[locale];
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviews, setReviews] = useState<Record<string, Review>>({});
  const [phase, setPhase] = useState<"idle" | "checking" | "sending">("idle");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<"queued" | "uncertain">();
  const controller = useRef<AbortController | null>(null);
  const lock = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const connection = connections.find(item => item.channelId === "ebay" && item.status === "connected");
  const environment = connection?.metadata.environment;
  const knownEnvironment = environment === "sandbox" || environment === "production";
  const selected = products.filter(product => selectedIds.includes(product.id));
  const active = selected.some(product => activeProductIds.includes(product.id));
  const busy = phase !== "idle" || refreshing || Boolean(outcome);
  const ready = selected.length > 0 && !active && knownEnvironment && selected.every(product => {
    const assessment = reviews[product.id]?.assessment;
    return assessment && canPublishAssessment(assessment);
  });

  function select(productId: string, checked: boolean) {
    setSelectedIds(current => checked ? [...current, productId] : current.filter(id => id !== productId));
    setReviews({}); setPreview(false); setError("");
  }

  async function check() {
    if (lock.current || busy || active || !connection) return;
    if (!selected.length || selected.length > 20) { setError(selected.length ? text.limit : text.choose); return; }
    lock.current = true;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setPhase("checking"); setPreview(false); setReviews({}); setError("");
    const results: Record<string, Review> = {};
    let storeRevision: string | undefined;
    try {
      // Keep external checks bounded; a large selection must not burst eBay's API.
      for (const product of selected) {
        try {
          const assessment = await readPublishAssessment(apiBaseUrl, product, connection, current.signal);
          if (storeRevision && storeRevision !== assessment.connectionRevision) {
            setError(text.storeChanged); setReviews({}); return;
          }
          storeRevision = assessment.connectionRevision;
          results[product.id] = { assessment };
        } catch (err) {
          if (current.signal.aborted) return;
          results[product.id] = { error: err instanceof PublishReviewError && err.reason === "stale" ? text.stale : text.unavailable };
        }
        if (current.signal.aborted) return;
        setReviews({ ...results });
      }
    } finally { lock.current = false; setPhase("idle"); }
  }

  async function publish() {
    if (lock.current || busy || !ready || !preview) return;
    lock.current = true;
    setPhase("sending"); setError("");
    try {
      const response = await fetch(`${apiBaseUrl}/publish-jobs/bulk`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: selected.map(product => ({ productId: product.id, productRevision: product.revision })),
          channels: ["ebay"], connectionRevisions: { ebay: reviews[selected[0].id].assessment!.connectionRevision } })
      });
      if (response.status === 409 || response.status === 400) {
        setReviews({}); setPreview(false); setError(text.stale); return;
      }
      if (!response.ok) throw new Error("unconfirmed");
      const body = await response.json();
      if (body.queuedCount !== selected.length) throw new Error("unconfirmed");
      setOutcome("queued"); setPreview(false);
      showFlash({ tone: "success", message: text.queued });
    } catch {
      // A lost HTTP response is not proof that enqueue failed. Do not offer a blind retry.
      setOutcome("uncertain"); setPreview(false); setError(text.uncertain);
    } finally {
      lock.current = false; setPhase("idle");
      startTransition(() => router.refresh());
    }
  }

  return <section className="listing-publish" aria-label={text.title} aria-busy={phase !== "idle"}>
    <h3>{text.title}</h3><p className="muted">{text.hint}</p>
    <div className="listing-section">
      <strong>eBay {connection?.externalAccountId}</strong>
      {knownEnvironment ? <><span className={"pill " + (environment === "sandbox" ? "attention" : "ready")}>{environment === "sandbox" ? store.sandbox : store.production}</span><p className="field-hint">{environment === "sandbox" ? store.sandboxHint : store.productionHint}</p></> : <p>{connection ? store.environmentUnknown : store.connect}</p>}
      <Link className="text-link" href="/channels#ebay">{store.storeFix}</Link>
    </div>
    <fieldset className="bulk-selection" disabled={busy || preview}>
      <legend>{text.select} ({selected.length}/20)</legend>
      <div className="list compact-list">
        {!products.length ? <p>{text.empty}</p> : products.map(product => {
          const review = reviews[product.id];
          const inProgress = activeProductIds.includes(product.id);
          return <div className="list-item" key={product.id}>
            <label className="checkbox-row">
              <input type="checkbox" checked={selectedIds.includes(product.id)} disabled={inProgress || (!selectedIds.includes(product.id) && selected.length >= 20)} onChange={event => select(product.id, event.target.checked)} />
              <span className="bulk-product-meta"><strong>{product.title}</strong><span className="muted">{product.sku} · {inProgress ? text.active : review?.assessment ? checks[review.assessment.status] : text.notChecked}</span></span>
            </label>
            {review?.error ? <p role="alert">{review.error}</p> : null}
            {review?.assessment?.issues.some(issue => issue.severity === "blocking") ? <ul>{review.assessment.issues.filter(issue => issue.severity === "blocking").map((issue, index) => <li key={index}>{issue.message}</li>)}</ul> : null}
            {review && (!review.assessment || !canPublishAssessment(review.assessment)) ? <Link className="text-link" href={`/products/${product.id}`}>{text.edit}</Link> : null}
          </div>;
        })}
      </div>
    </fieldset>
    <p className="field-hint">{text.noSync}</p>
    {error ? <p className="issue blocking" role="alert">{error}</p> : null}
    {outcome ? <div role="status">{outcome === "queued" ? <p>{text.queued}</p> : null}<button className="button-secondary" type="button" onClick={() => window.location.reload()}>{text.reload}</button></div> : preview && ready ? <section aria-label={text.preview}>
      <h3>{text.preview}</h3><p className="field-hint">{publishFlowCopy[locale].hint}</p>
      {selected.map(product => <div className="listing-section" key={product.id}><EbayPublishPreview product={product} locale={locale} /></div>)}
      <div className="editor-actions"><button type="button" className="button-secondary" disabled={busy} onClick={() => setPreview(false)}>{text.back}</button><button type="button" className="button-primary" disabled={busy} onClick={() => void publish()}>{phase === "sending" ? text.sending : text.confirm}</button></div>
    </section> : <div className="editor-actions">
      <button type="button" className="button-secondary" disabled={busy || active || !connection || !knownEnvironment || !selected.length} onClick={() => void check()}>{phase === "checking" ? text.checking : text.check}</button>
      <button type="button" className="button-primary" disabled={busy || !ready} onClick={() => setPreview(true)}>{text.preview}</button>
    </div>}
  </section>;
}
