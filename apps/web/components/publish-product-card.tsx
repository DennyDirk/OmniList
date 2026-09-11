"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { buildEbayAspects, validateEbayCategory, validateProductForChannel, type ChannelConnection, type EbayCategoryRequirements, type Product } from "@omnilist/shared";
import { dictionaries, type Locale } from "../lib/i18n";
import { publishCopy } from "../lib/publish-copy";
import { useFlash } from "./flash-provider";

export function PublishProductCard({ apiBaseUrl, product, connection, active, hasPublished, locale }: {
  apiBaseUrl: string; product: Product; connection?: ChannelConnection; active: boolean; hasPublished: boolean; locale: Locale;
}) {
  const router = useRouter();
  const text = publishCopy[locale];
  const dictionary = dictionaries[locale];
  const { showFlash } = useFlash();
  const [isPending, startTransition] = useTransition();
  const [phase, setPhase] = useState<"idle" | "checking" | "sending">("idle");
  const [errors, setErrors] = useState<string[]>([]);
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
  const productIssues = validateProductForChannel(product, "ebay").issues.filter(issue => issue.severity === "blocking").map(issue => issue.message);
  const busy = phase !== "idle" || isPending || active;
  const blocked = setupIssues.length > 0 || productIssues.length > 0;

  async function publish() {
    if (lock.current || busy || blocked) return;
    lock.current = true;
    setErrors([]);
    setPhase("checking");
    let sending = false;
    try {
      const response = await fetch(apiBaseUrl + "/channel-connections/ebay/category-requirements?categoryId=" + encodeURIComponent(product.channelOverrides.ebay?.categoryId || ""), { credentials: "include" });
      const body = await response.json().catch(() => undefined) as { item?: EbayCategoryRequirements; message?: string } | undefined;
      if (!response.ok || !body?.item) throw new Error(body?.message || text.checkFailed);
      const issues = validateEbayCategory(body.item, product.channelOverrides.ebay?.condition, buildEbayAspects(product));
      if (issues.length) { setErrors(issues); return; }
      setPhase("sending");
      sending = true;
      const result = await fetch(apiBaseUrl + "/products/" + product.id + "/publish", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels: ["ebay"] })
      });
      if (!result.ok) {
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
    {productIssues.length ? <div className="issue blocking"><strong>{text.checks}</strong><ul>{productIssues.map(issue => <li key={issue}>{issue}</li>)}</ul><Link className="text-link" href={`/products/${product.id}/edit`}>{text.productFix}</Link></div> : null}
    {errors.length ? <div className="issue blocking" role="alert"><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul><Link className="text-link" href={`/products/${product.id}/edit`}>{text.productFix}</Link></div> : null}
    {active ? <p role="status">{text.pending}</p> : <p className="field-hint">{text.checkHint}</p>}
    <button className="button-primary" disabled={busy || blocked} type="button" onClick={() => void publish()}>{phase === "checking" ? text.checking : phase === "sending" ? text.sending : active ? dictionary.common.refreshing : hasPublished ? text.update : text.publish}</button>
  </section>;
}
