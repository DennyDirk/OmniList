import type { ConnectionStatus, PublishJobStatus, PublishStatus, PublishTargetStatus } from "@omnilist/shared";

import { en } from "./locales/en";
import { ru } from "./locales/ru";
import { uk } from "./locales/uk";

export const localeCookieName = "omnilist-locale";
export const locales = ["en", "uk", "ru"] as const;

export type Locale = (typeof locales)[number];

const jsLocaleByLocale: Record<Locale, string> = {
  en: "en-US",
  uk: "uk-UA",
  ru: "ru-RU"
};

export const dictionaries = {
  en,
  uk,
  ru
} as const;

export type Dictionary = (typeof dictionaries)[Locale];

export function resolveLocale(value?: string | null): Locale {
  if (value && locales.includes(value as Locale)) {
    return value as Locale;
  }

  return "en";
}

export function formatConnectionStatus(dictionary: Dictionary, status: ConnectionStatus) {
  if (status === "connected") {
    return dictionary.statuses.connected;
  }

  if (status === "attention_required") {
    return dictionary.statuses.attentionRequired;
  }

  return dictionary.statuses.disconnected;
}

export function formatReadinessStatus(dictionary: Dictionary, status: PublishStatus) {
  return status === "ready" ? dictionary.statuses.ready : dictionary.statuses.needsAttention;
}

export function formatPublishJobStatus(dictionary: Dictionary, status: PublishJobStatus) {
  switch (status) {
    case "queued":
      return dictionary.statuses.queued;
    case "processing":
      return dictionary.statuses.processing;
    case "completed":
      return dictionary.statuses.completed;
    case "partial":
      return dictionary.statuses.partial;
    case "failed":
      return dictionary.statuses.failed;
  }
}

export function formatPublishTargetStatus(dictionary: Dictionary, status: PublishTargetStatus) {
  switch (status) {
    case "queued":
      return dictionary.statuses.queued;
    case "processing":
      return dictionary.statuses.processing;
    case "published":
      return dictionary.statuses.published;
    case "failed":
      return dictionary.statuses.failed;
  }
}

export function formatDateTime(value: string, locale: Locale) {
  return new Date(value).toLocaleString(jsLocaleByLocale[locale]);
}
