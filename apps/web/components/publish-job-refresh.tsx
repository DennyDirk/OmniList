"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "../lib/i18n";

export function PublishJobRefresh({ active, locale }: { active: boolean; locale: Locale }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > 120_000) {
        clearInterval(timer);
        setPaused(true);
      } else if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [active, router]);

  if (!active) return null;
  return <p role="status" className="field-hint">
    {paused
      ? { en: "Still waiting for confirmation. Check eBay before retrying publication.", ru: "Подтверждение задерживается. Перед повторной публикацией проверьте eBay.", uk: "Підтвердження затримується. Перед повторною публікацією перевірте eBay." }[locale]
      : { en: "Updating publishing status...", ru: "Обновляем статус публикации...", uk: "Оновлюємо статус публікації..." }[locale]}
    {paused ? <button className="button-secondary" type="button" onClick={() => router.refresh()}>{ { en: "Refresh", ru: "Обновить", uk: "Оновити" }[locale]}</button> : null}
  </p>;
}
