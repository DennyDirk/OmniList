"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "../lib/i18n";

interface ListingStatus {
  environment: "sandbox" | "production";
  checkedAt: string;
  offers: Array<{ offerId: string; status: string; listingStatus?: string; listingId?: string; url?: string }>;
}
const copy = {
  en: { check: "Check listing on eBay", checking: "Checking...", empty: "No offers found for this SKU in the connected account.", hint: "Reads the current seller API status. Search visibility is separate; this does not republish your item.", open: "Open listing", error: "Could not verify the listing. Try again." },
  ru: { check: "Проверить объявление на eBay", checking: "Проверяем...", empty: "В подключённом аккаунте не найдено предложений с этим SKU.", hint: "Проверяет текущий статус через API продавца. Видимость в поиске проверяется отдельно. Товар повторно не публикуется.", open: "Открыть объявление", error: "Не удалось проверить объявление. Повторите попытку." },
  uk: { check: "Перевірити оголошення на eBay", checking: "Перевіряємо...", empty: "У підключеному акаунті не знайдено пропозицій з цим SKU.", hint: "Перевіряє поточний статус через API продавця. Видимість у пошуку перевіряється окремо. Товар повторно не публікується.", open: "Відкрити оголошення", error: "Не вдалося перевірити оголошення. Спробуйте ще раз." }
};

export function EbayListingStatus({ apiBaseUrl, productId, locale }: { apiBaseUrl: string; productId: string; locale: Locale }) {
  const text = copy[locale];
  const [item, setItem] = useState<ListingStatus>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function check() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true); setError(""); setItem(undefined);
    try {
      const response = await fetch(`${apiBaseUrl}/products/${productId}/ebay-listing`, { credentials: "include", signal: controller.signal });
      const body = await response.json() as { item?: ListingStatus; message?: string };
      if (!response.ok || !body.item) throw new Error(body.message || text.error);
      if (!controller.signal.aborted) setItem(body.item);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : text.error);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  return <section className="card">
    <button type="button" className="button-secondary" disabled={loading} onClick={() => void check()}>{loading ? text.checking : text.check}</button>
    <p className="field-hint">{text.hint}</p>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
    {item ? <div aria-live="polite"><p className="field-hint">{item.environment} / {new Date(item.checkedAt).toLocaleString(locale)}</p>
      {!item.offers.length ? <p>{text.empty}</p> : item.offers.map(offer => <div className="list-item" key={offer.offerId}>
        <p>{offer.status}{offer.listingStatus ? " / " + offer.listingStatus : ""}</p>
        {offer.url ? <a className="text-link" href={offer.url} target="_blank" rel="noreferrer">{text.open} {offer.listingId}</a> : null}
      </div>)}
    </div> : null}
  </section>;
}
