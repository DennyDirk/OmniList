"use client";

import { useEffect, useRef, useState } from "react";
import type { Locale } from "../lib/i18n";
import { publishCopy } from "../lib/publish-copy";

interface CategoryChoice { id: string; name: string; path: string }

export function EbayCategoryPicker({ apiBaseUrl, onSelect, locale }: {
  apiBaseUrl: string; onSelect: (id: string) => void; locale: Locale;
}) {
  const text = publishCopy[locale];
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<CategoryChoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setItems(null);
    try {
      const response = await fetch(`${apiBaseUrl}/channel-connections/ebay/categories?q=${encodeURIComponent(query.trim())}`, { credentials: "include", signal: controller.signal });
      const body = await response.json() as { items?: CategoryChoice[]; message?: string };
      if (!response.ok || !body.items) throw new Error(body.message || text.checkFailed);
      if (!controller.signal.aborted) setItems(body.items);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : text.checkFailed);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return <div className="category-picker">
    <label className="field"><span>{text.category}</span><input value={query} maxLength={80} placeholder="T-Shirts"
      onChange={event => { request.current?.abort(); setLoading(false); setItems(null); setError(""); setQuery(event.target.value); }}
      onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); if (query.trim().length >= 2) void search(); } }}
    /><span className="field-hint">{text.searchHint}</span></label>
    <button type="button" className="button-secondary" disabled={loading || query.trim().length < 2} onClick={() => void search()}>{loading ? text.checking : text.search}</button>
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    {items ? <div className="category-results" aria-live="polite">
      {!items.length ? <p>{text.noResults}</p> : items.map(item => <button type="button" className="option-chip" key={item.id} onClick={() => onSelect(item.id)}><strong>{item.name}</strong><small>{item.path}</small></button>)}
    </div> : null}
  </div>;
}
