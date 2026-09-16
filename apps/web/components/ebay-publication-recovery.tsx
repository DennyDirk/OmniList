"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ebayRecoveryResultSchema, getEbayListingUrl, type EbayRecoveryResult } from "@omnilist/shared";
import type { Locale } from "../lib/i18n";

const copy = {
  en: {
    title: "Publication result unclear?", action: "Check saved offer", checking: "Checking saved offer...",
    hint: "Checks the offer saved by OmniList. Does not create or publish a listing and never unlocks a running publication.",
    published: "An active listing was confirmed. This does not confirm that your latest edits reached eBay. Previous job history remains unchanged.",
    retryable: "The saved offer is not published. Check the product above, then publish again. OmniList will reuse this offer.",
    blocked: "No safe recovery is available. The offer may be missing, still processing, or tied to another connection. Nothing was republished.",
    error: "Could not confirm recovery. Check again before publishing; do not create a duplicate product.", open: "Open listing"
  },
  ru: {
    title: "Результат публикации неизвестен?", action: "Проверить сохранённый offer", checking: "Проверяем сохранённый offer...",
    hint: "Проверит сохранённый OmniList offer. Не создаёт и не публикует объявление, не снимает блокировку работающей публикации.",
    published: "Активное объявление подтверждено. Это не подтверждает отправку последних правок на eBay. История прежних заданий не меняется.",
    retryable: "Сохранённый offer ещё не опубликован. Проверьте товар выше, затем повторите публикацию. OmniList использует тот же offer.",
    blocked: "Безопасное восстановление недоступно: offer может отсутствовать, публикация ещё выполняется или подключение изменилось. Повторной публикации не было.",
    error: "Не удалось подтвердить восстановление. Повторите проверку перед публикацией; не создавайте копию товара.", open: "Открыть объявление"
  },
  uk: {
    title: "Результат публікації невідомий?", action: "Перевірити збережений offer", checking: "Перевіряємо збережений offer...",
    hint: "Перевірить збережений OmniList offer. Не створює та не публікує оголошення, не знімає блокування активної публікації.",
    published: "Активне оголошення підтверджено. Це не підтверджує надсилання останніх змін на eBay. Історія попередніх завдань не змінюється.",
    retryable: "Збережений offer ще не опублікований. Перевірте товар вище та повторіть публікацію. OmniList використає той самий offer.",
    blocked: "Безпечне відновлення недоступне: offer може бути відсутній, публікація ще триває або підключення змінилося. Повторної публікації не було.",
    error: "Не вдалося підтвердити відновлення. Повторіть перевірку перед публікацією; не створюйте копію товару.", open: "Відкрити оголошення"
  }
};

export function EbayPublicationRecovery({ apiBaseUrl, productId, connectionId, locale }: {
  apiBaseUrl: string; productId: string; connectionId: string; locale: Locale;
}) {
  const text = copy[locale];
  const router = useRouter();
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<EbayRecoveryResult>();
  const [error, setError] = useState("");
  useEffect(() => () => request.current?.abort(), []);

  async function recover() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setError(""); setResult(undefined);
    try {
      const response = await fetch(`${apiBaseUrl}/products/${encodeURIComponent(productId)}/ebay-offer-repair`, {
        method: "POST", credentials: "include", cache: "no-store", signal: controller.signal
      });
      if (!response.ok) throw new Error(response.status === 409 ? text.blocked : text.error);
      const body = await response.json();
      const parsed = ebayRecoveryResultSchema.safeParse(body?.item);
      if (!parsed.success || parsed.data.productId !== productId || parsed.data.connectionId !== connectionId) throw new Error(text.error);
      if (controller.signal.aborted) return;
      setResult(parsed.data);
      router.refresh();
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : text.error);
    } finally {
      if (!controller.signal.aborted) { request.current = null; setPending(false); }
    }
  }

  const url = getEbayListingUrl(result?.remoteListing);
  return <details className="card">
    <summary>{text.title}</summary>
    <p className="field-hint">{text.hint}</p>
    <button className="button-secondary" type="button" disabled={pending || Boolean(result)} onClick={() => void recover()}>
      {pending ? text.checking : text.action}
    </button>
    <div aria-live="polite" aria-busy={pending}>
      {result ? <p>{text[result.status]}</p> : null}
      {url ? <a className="text-link" href={url} target="_blank" rel="noreferrer">{text.open}</a> : null}
    </div>
    {error ? <p className="field-error" role="alert">{error}</p> : null}
  </details>;
}
