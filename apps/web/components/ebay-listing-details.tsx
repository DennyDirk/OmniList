"use client";

import { useEffect, useRef, useState } from "react";
import { ebayListingDetailsSchema, type EbayListingDetails } from "@omnilist/shared";
import { ebayCatalogCopy } from "../lib/ebay-catalog-copy";

export function EbayListingDetailsPreview({ apiBaseUrl, listingId, connectionId, environment, page, locale }: {
  apiBaseUrl: string; listingId: string; connectionId: string; environment: "sandbox" | "production";
  page: number; locale: keyof typeof ebayCatalogCopy;
}) {
  const copy = ebayCatalogCopy[locale].details;
  const [details, setDetails] = useState<EbayListingDetails>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
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

  return <div aria-busy={loading}>
    <button type="button" className="button-secondary" disabled={loading} onClick={() => details ? setDetails(undefined) : void load()}>
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
      </> : null}
    </div>
  </div>;
}
