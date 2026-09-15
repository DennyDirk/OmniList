"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ebayListingDetailsSchema, productImportResultSchema, type EbayListingDetails } from "@omnilist/shared";
import { ebayCatalogCopy } from "../lib/ebay-catalog-copy";
import { useFlash } from "./flash-provider";

export function EbayListingDetailsPreview({ apiBaseUrl, listingId, connectionId, environment, page, locale, localLink }: {
  apiBaseUrl: string; listingId: string; connectionId: string; environment: "sandbox" | "production";
  page: number; locale: keyof typeof ebayCatalogCopy;
  localLink?: { kind: "imported" | "managed"; productId: string; productTitle: string };
}) {
  const copy = ebayCatalogCopy[locale].details;
  const [details, setDetails] = useState<EbayListingDetails>();
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(false);
  const [imported, setImported] = useState<{ productId: string; outcome: "imported" | "existing" | "managed" }>();
  const { showFlash } = useFlash();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function load() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true); setError(false); setDetails(undefined);
    try {
      const query = new URLSearchParams({ page: String(page), connectionId, environment });
      const response = await fetch(`${apiBaseUrl}/channels/ebay/active-listings/${encodeURIComponent(listingId)}?${query}`, {
        credentials: "include", cache: "no-store", signal: current.signal
      });
      if (!response.ok) throw new Error("DETAILS_UNAVAILABLE");
      const result = ebayListingDetailsSchema.parse((await response.json()).item);
      if (result.source.connectionId !== connectionId || result.source.environment !== environment || result.source.listingId !== listingId) {
        throw new Error("DETAILS_CHANGED");
      }
      if (!current.signal.aborted) setDetails(result);
    } catch { if (!current.signal.aborted) setError(true); }
    finally { if (!current.signal.aborted) setLoading(false); }
  }

  async function importListing() {
    if (!details?.importAvailable || importing) return;
    setImporting(true);
    try {
      const response = await fetch(`${apiBaseUrl}/channels/ebay/active-listings/${encodeURIComponent(listingId)}/import`, {
        method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, connectionId, environment })
      });
      const body = await response.json().catch(() => undefined) as { item?: unknown; message?: string } | undefined;
      if (!response.ok || !body?.item) throw new Error(body?.message || copy.importError);
      const result = productImportResultSchema.parse(body.item);
      setImported({ productId: result.product.id, outcome: result.outcome });
      showFlash({ tone: result.outcome === "imported" ? "success" : "info", message: copy[result.outcome] });
    } catch (cause) {
      showFlash({ tone: "error", message: cause instanceof Error ? cause.message : copy.importError });
    } finally { setImporting(false); }
  }

  return <div aria-busy={loading || importing}>
    <button type="button" className="button-secondary" disabled={loading || importing} onClick={() => details ? setDetails(undefined) : void load()}>
      {loading ? copy.loading : details ? copy.close : copy.open}
    </button>
    {error ? <p role="alert">{copy.error}</p> : null}
    <div aria-live="polite">
      {details ? <>
        <p className="muted">{copy.readOnly}</p>
        <dl>
          <dt>{copy.category}</dt><dd>{details.category?.name || details.category?.id || copy.unknown}</dd>
          <dt>{copy.condition}</dt><dd>{details.condition?.name || details.condition?.id || copy.unknown}</dd>
          <dt>{copy.quantity}</dt><dd>{details.quantity ?? copy.unknown}</dd>
          <dt>{copy.price}</dt><dd>{details.price ? `${details.price.value} ${details.price.currency}` : copy.unknown}</dd>
          <dt>{copy.pictures}</dt><dd>{details.pictureCount}</dd>
        </dl>
        {details.limitations.length ? <ul>{details.limitations.map(code => <li key={code}>{copy.limitations[code]}</li>)}</ul> : null}
        {details.aspects.length ? <details><summary>{copy.aspects}</summary><dl>
          {details.aspects.map((aspect, index) => <div key={index}><dt>{aspect.name}</dt><dd>{aspect.values.join(", ")}</dd></div>)}
        </dl></details> : null}
        {localLink ? <p role="status">{copy[localLink.kind]} <Link className="text-link" href={`/products/${encodeURIComponent(localLink.productId)}`}>{copy.openProduct}</Link></p>
          : imported ? <p role="status">{copy[imported.outcome]} <Link className="text-link" href={`/products/${encodeURIComponent(imported.productId)}`}>{copy.openProduct}</Link></p>
          : details.importAvailable ? <button type="button" className="button-primary" disabled={importing} onClick={() => void importListing()}>
            {importing ? copy.importing : copy.import}
          </button> : null}
      </> : null}
    </div>
  </div>;
}
