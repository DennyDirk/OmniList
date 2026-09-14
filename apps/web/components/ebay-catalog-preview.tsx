"use client";

import { useRef, useState, useEffect } from "react";
import { ebayCatalogPageSchema, ebayActiveListingsPageSchema, type EbayCatalogPage, type EbayActiveListingsPage } from "@omnilist/shared";
import { ebayCatalogCopy } from "../lib/ebay-catalog-copy";
import { EbayListingDetailsPreview } from "./ebay-listing-details";

export function EbayCatalogPreview({ apiBaseUrl, locale }: {
  apiBaseUrl: string; locale: keyof typeof ebayCatalogCopy;
}) {
  const copy = ebayCatalogCopy[locale];
  const [page, setPage] = useState<EbayCatalogPage>();
  const [activePage, setActivePage] = useState<EbayActiveListingsPage>();
  const [source, setSource] = useState("active");
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
    setActivePage(undefined);
    try {
      const endpoint = source === "active" ? `/channels/ebay/active-listings?page=${offset}` : `/channel-connections/ebay/catalog?offset=${offset}`;
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        cache: "no-store", credentials: "include", signal: current.signal
      });
      if (!response.ok) throw new Error("CATALOG_UNAVAILABLE");
      const result = await response.json();
      if (source === "active") {
        const next = ebayActiveListingsPageSchema.parse(result);
        if (!current.signal.aborted) setActivePage(next);
      } else {
        const next = ebayCatalogPageSchema.parse(result.item);
        if (!current.signal.aborted) setPage(next);
      }
    } catch {
      if (!current.signal.aborted) setError(true);
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }

  return <section className="card ebay-catalog-preview" aria-busy={loading}>
    <label>{copy.source}
      <select value={source} onChange={event => {
        controller.current?.abort();
        setSource(event.target.value); setPage(undefined); setActivePage(undefined); setError(false); setLoading(false);
      }}>
        <option value="active">{copy.active}</option>
        <option value="inventory">Inventory API</option>
      </select>
    </label>
    <p>{source === "active" ? copy.activeIntro : copy.intro}</p>
    <p className="muted">{source === "active" ? copy.activeNote : copy.limitation}</p>
    <button type="button" className="button-primary" disabled={loading} onClick={() => void load(source === "active" ? 1 : 0)}>
      {loading ? copy.loading : copy.load}
    </button>
    {error ? <p role="alert" className="banner error">{copy.error} <a href="/channels">{copy.connect}</a></p> : null}
    <div aria-live="polite">
      {activePage ? <>
        <p><strong>{activePage.environment === "sandbox" ? "Sandbox" : "Production"}</strong> · {copy.readOnly}</p>
        <p>{copy.active}: {activePage.total} · {copy.page} {activePage.page}</p>
        {activePage.limited || activePage.warning ? <p role="status">{copy.partial}</p> : null}
        {activePage.items.length ? <ul className="ebay-catalog-items">
          {activePage.items.map(item => <li key={item.listingId}>
            <a href={`https://${activePage.environment === "sandbox" ? "www.sandbox.ebay.com" : "www.ebay.com"}/itm/${encodeURIComponent(item.listingId)}`} target="_blank" rel="noopener noreferrer">{item.title}</a>
            <span className="muted">ID: {item.listingId}{item.sku ? ` · SKU: ${item.sku}` : ""}</span>
            <span>{item.price ? `${item.price.value} ${item.price.currency}` : copy.unknownPrice}</span>
            <EbayListingDetailsPreview key={`${activePage.connectionId}:${activePage.environment}:${activePage.page}:${item.listingId}`}
              apiBaseUrl={apiBaseUrl} listingId={item.listingId} connectionId={activePage.connectionId}
              environment={activePage.environment} page={activePage.page} locale={locale} />
          </li>)}
        </ul> : <p>{copy.activeEmpty}</p>}
        <nav className="ebay-catalog-pagination" aria-label={copy.page}>
          <button type="button" className="button-secondary" disabled={loading || activePage.page === 1} onClick={() => void load(activePage.page - 1)}>{copy.previous}</button>
          <button type="button" className="button-secondary" disabled={loading || activePage.nextPage === null} onClick={() => activePage.nextPage !== null && void load(activePage.nextPage)}>{copy.next}</button>
        </nav>
      </> : null}
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
