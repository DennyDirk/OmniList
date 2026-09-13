"use client";

import { useRef, useState, useEffect } from "react";
import { ebayCatalogPageSchema, type EbayCatalogPage } from "@omnilist/shared";
import { ebayCatalogCopy } from "../lib/ebay-catalog-copy";

export function EbayCatalogPreview({ apiBaseUrl, locale }: {
  apiBaseUrl: string; locale: keyof typeof ebayCatalogCopy;
}) {
  const copy = ebayCatalogCopy[locale];
  const [page, setPage] = useState<EbayCatalogPage>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function load(offset: number) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError(false);
    setPage(undefined);
    try {
      const response = await fetch(`${apiBaseUrl}/channel-connections/ebay/catalog?offset=${offset}`, {
        cache: "no-store", credentials: "include", signal: current.signal
      });
      if (!response.ok) throw new Error("CATALOG_UNAVAILABLE");
      const result = await response.json();
      const next = ebayCatalogPageSchema.parse(result.item);
      if (!current.signal.aborted) setPage(next);
    } catch {
      if (!current.signal.aborted) setError(true);
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }

  return <section className="card ebay-catalog-preview" aria-busy={loading}>
    <p>{copy.intro}</p>
    <p className="muted">{copy.limitation}</p>
    <button type="button" className="button-primary" disabled={loading} onClick={() => void load(0)}>
      {loading ? copy.loading : copy.load}
    </button>
    {error ? <p role="alert" className="banner error">{copy.error} <a href="/channels">{copy.connect}</a></p> : null}
    <div aria-live="polite">
      {page ? <>
        <p><strong>{page.environment === "sandbox" ? "Sandbox" : "Production"}</strong> · {copy.readOnly}</p>
        <p>{copy.count}: {page.total} · {copy.page} {page.offset / 20 + 1}</p>
        {page.items.length ? <ul className="ebay-catalog-items">
          {page.items.map(item => <li key={item.sku}>
            <strong>{item.title}</strong><span className="muted">SKU: {item.sku}</span>
          </li>)}
        </ul> : <p>{copy.empty}</p>}
        <p className="muted">{copy.note}</p>
        <nav className="ebay-catalog-pagination" aria-label={copy.page}>
          <button type="button" className="button-secondary" disabled={loading || page.offset === 0}
            onClick={() => void load(page.offset - 20)}>{copy.previous}</button>
          <button type="button" className="button-secondary" disabled={loading || page.nextOffset === null}
            onClick={() => page.nextOffset !== null && void load(page.nextOffset)}>{copy.next}</button>
        </nav>
      </> : null}
    </div>
  </section>;
}
