"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { assessmentSchema, canPublishAssessment, getEffectiveProductForChannel, type UnifiedAssessment, type ChannelConnection, type Product } from "@omnilist/shared";
import { dictionaries, type Locale } from "../lib/i18n";
import { publishCopy } from "../lib/publish-copy";
import { useFlash } from "./flash-provider";
import { assessmentCopy } from "../lib/assessment-copy";
import { publishFlowCopy } from "../lib/publish-flow-copy";
import { ProductEditor } from "./product-editor";

export function PublishProductCard({ apiBaseUrl, product, connection, active, hasPublished, locale }: {
  apiBaseUrl: string; product: Product; connection?: ChannelConnection; active: boolean; hasPublished: boolean; locale: Locale;
}) {
  const router = useRouter();
  const text = publishCopy[locale];
  const checks = assessmentCopy[locale];
  const flow = publishFlowCopy[locale];
  const dictionary = dictionaries[locale];
  const { showFlash } = useFlash();
  const [isPending, startTransition] = useTransition();
  const [phase, setPhase] = useState<"idle" | "checking" | "sending">("idle");
  const [errors, setErrors] = useState<string[]>([]);
  const [assessment, setAssessment] = useState<UnifiedAssessment>();
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [stale, setStale] = useState(false);
  const staleMessage = locale === "ru" ? "Товар изменился. Обновите данные, повторите проверку и подтвердите новый preview."
    : locale === "uk" ? "Товар змінився. Оновіть дані, повторіть перевірку та підтвердьте новий preview."
    : "The product changed. Reload it, check it again and confirm the new preview.";
  const effective = getEffectiveProductForChannel(product, "ebay");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const lock = useRef(false);
  const metadata = connection?.metadata ?? {};
  const connected = connection?.status === "connected";
  const setupMissing = ["merchantLocationKey", "fulfillmentPolicyId", "paymentPolicyId", "returnPolicyId"].some(key => !metadata[key]?.trim());
  const environment = metadata.environment;
  const knownEnvironment = environment === "sandbox" || environment === "production";
  const setupIssues = !connected ? [text.connect] : [
    ...(setupMissing ? [text.setupMissing] : []),
    ...((metadata.marketplaceId || "EBAY_US") !== "EBAY_US" || (metadata.currency || "USD") !== "USD" ? [text.unsupportedMarket] : []),
    ...(!knownEnvironment ? [text.environmentUnknown] : [])
  ];
  const productIssues = assessment?.issues.filter(issue => issue.severity === "blocking") ?? [];
  const recommendations = assessment?.issues.filter(issue => issue.severity !== "blocking") ?? [];
  const busy = phase !== "idle" || isPending || active;
  const blocked = stale || !product.revision || editing || setupIssues.length > 0 || !assessment || !canPublishAssessment(assessment);

  function edit() {
    if (busy) return;
    setAssessment(undefined);
    setPreview(false);
    setEditing(true);
  }

  async function checkReadiness() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setAssessment(undefined);
    const response = await fetch(`${apiBaseUrl}/products/${encodeURIComponent(product.id)}/readiness?channels=ebay`, {
      credentials: "include", cache: "no-store", signal: current.signal
    });
    if (!response.ok) throw new Error(text.checkFailed);
    const body = await response.json().catch(() => undefined);
    if (!product.revision || body?.productRevision !== product.revision) {
      setStale(true); setPreview(false);
      throw new Error(staleMessage);
    }
    const parsed = assessmentSchema.safeParse(body?.items?.[0]);
    if (!parsed.success) throw new Error(text.checkFailed);
    const next = parsed.data;
    if (next.productId !== product.id || next.channelId !== "ebay" || next.connectionId !== connection?.id) throw new Error(text.checkFailed);
    if (current.signal.aborted) throw new Error(text.checkFailed);
    setAssessment(next);
    return next;
  }

  async function check() {
    if (lock.current || busy) return;
    lock.current = true;
    setPreview(false);
    setErrors([]);
    setPhase("checking");
    try { await checkReadiness(); }
    catch (err) { if (!controller.current?.signal.aborted) setErrors([err instanceof Error ? err.message : text.checkFailed]); }
    finally { lock.current = false; setPhase("idle"); }
  }

  async function publish() {
    if (lock.current || busy || blocked || !preview) return;
    lock.current = true;
    setErrors([]);
    setPhase("checking");
    let sending = false;
    try {
      const next = await checkReadiness();
      if (!canPublishAssessment(next)) { setPreview(false); return; }
      setPhase("sending");
      sending = true;
      const result = await fetch(apiBaseUrl + "/products/" + product.id + "/publish", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels: ["ebay"], productRevision: product.revision })
      });
      if (!result.ok) {
        if (result.status === 409) { setStale(true); setPreview(false); setAssessment(undefined); throw new Error(staleMessage); }
        const body = await result.json().catch(() => undefined) as { message?: string } | undefined;
        throw new Error(body?.message || dictionary.publishCard.enqueueFailed);
      }
      showFlash({ tone: "success", message: dictionary.publishCard.enqueueSuccess });
      startTransition(() => router.refresh());
    } catch (err) {
      setErrors([err instanceof Error ? err.message : sending ? dictionary.publishCard.enqueueFailed : text.checkFailed]);
    } finally {
      setPhase("idle");
      lock.current = false;
    }
  }

  return <section className="card listing-publish" aria-labelledby="publish-heading">
    <h2 id="publish-heading">{text.review}</h2>
    {knownEnvironment ? <><span className={"pill " + (environment === "sandbox" ? "attention" : "ready")}>{environment === "sandbox" ? text.sandbox : text.production}</span><p className="muted">{environment === "sandbox" ? text.sandboxHint : text.productionHint}</p></> : null}
    <div className="listing-section">
      <strong>{text.store}</strong>
      <p className="field-hint">{text.storeHint}</p>
      {setupIssues.length ? <div className="issue warning">{setupIssues.map(issue => <p key={issue}>{issue}</p>)}</div> : <p className="muted">{connection?.externalAccountId}<br />{text.setupReady}</p>}
      <Link className="text-link" href="/channels">{text.storeFix}</Link>
    </div>
    <div className="listing-section" aria-live="polite" aria-busy={phase === "checking"}>
      <strong>{phase === "checking" ? text.checking : assessment ? checks[assessment.status] : checks.initial}</strong>
      {assessment ? <p className="field-hint">{checks.checked}: {new Date(assessment.checkedAt).toLocaleTimeString(locale)}</p> : null}
      {productIssues.length ? <ul>{productIssues.map((issue, index) => <li key={`${issue.code}-${index}`}>
        {issue.message} {issue.field === "connection" ? <Link className="text-link" href="/channels">{text.storeFix}</Link> :
          <button type="button" className="button-secondary" disabled={busy} onClick={edit}>{flow.edit}</button>}
      </li>)}</ul> : null}
      {recommendations.length ? <details><summary>{checks.suggestions}</summary><ul>{recommendations.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul></details> : null}
      <button className="button-secondary" type="button" disabled={busy || editing || stale} onClick={() => void check()}>{checks.check}</button>
      {stale ? <button className="button-secondary" type="button" disabled={busy} onClick={() => startTransition(() => router.refresh())}>{locale === "ru" ? "Обновить товар" : locale === "uk" ? "Оновити товар" : "Reload product"}</button> : null}
    </div>
    {editing ? <div className="listing-section">
      <ProductEditor apiBaseUrl={apiBaseUrl} initialProduct={product} locale={locale} onCancel={() => setEditing(false)} onSaved={() => {
        setEditing(false); setAssessment(undefined); setPreview(false);
        showFlash({ tone: "success", message: flow.saved });
        startTransition(() => router.refresh());
      }} />
    </div> : null}
    {errors.length ? <div className="issue blocking" role="alert"><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul><Link className="text-link" href={`/products/${product.id}/edit`}>{text.productFix}</Link></div> : null}
    {active ? <p role="status">{text.pending}</p> : <p className="field-hint">{text.checkHint}</p>}
    {preview && !blocked ? <section className="listing-section" aria-label={flow.preview}>
      <h3>{flow.preview}</h3><p className="field-hint">{flow.hint}</p>
      <h4>{effective.title}</h4>
      <div className="listing-photos">{product.images.map(image => <div className="listing-photo" key={image.id}><img src={image.url} alt={image.altText || effective.title} /></div>)}</div>
      <p className="listing-description">{effective.description}</p>
      <p><strong>{new Intl.NumberFormat(locale, { style: "currency", currency: product.currency }).format(effective.basePrice)}</strong> · {text.count}: {product.quantity}</p>
      <p>{flow.category}: {product.channelOverrides.ebay?.categoryId} · {flow.condition}: {product.channelOverrides.ebay?.condition}</p>
      <button className="button-secondary" type="button" disabled={busy} onClick={() => setPreview(false)}>{flow.back}</button>
      <button className="button-primary" disabled={busy} type="button" onClick={() => void publish()}>{phase === "checking" ? text.checking : phase === "sending" ? text.sending : hasPublished ? text.update : flow.confirm}</button>
    </section> : <button className="button-primary" disabled={busy || blocked} type="button" onClick={() => setPreview(true)}>{active ? dictionary.common.refreshing : flow.preview}</button>}
  </section>;
}
