import type { Locale } from "./i18n";

export const etsyCopy = {
  en: {
    channels: "Sales channels", hint: "Connect your Etsy shop securely. OmniList finds the shop automatically; no tokens or IDs to paste.",
    scope: "This step only reads shop details. It does not create, change or activate listings.",
    unavailable: "Etsy connection is not configured on this server yet.",
    next: "Shop linked. Etsy publishing is not available yet; seller setup and draft creation are next.",
    disconnect: "Disconnect removes access from OmniList, not the shop or its listings. You can also revoke the app in Etsy settings.",
    cancelled: "Etsy connection was cancelled. Your previous connection was not changed.",
    noShop: "No Etsy shop was found for this account. Open your seller shop on Etsy, then connect again.",
    failed: "Could not connect Etsy. Check the app access and try Connect again. Your previous connection was not replaced.",
    scopes: "Etsy did not grant the required shop permission. Connect again and approve shop access."
  },
  ru: {
    channels: "Каналы продаж", hint: "Подключите магазин Etsy. Найдём его автоматически: токены и ID вводить не нужно.",
    scope: "На этом этапе только читаем данные магазина. Объявления не создаются, не изменяются и не активируются.",
    unavailable: "Подключение Etsy ещё не настроено на сервере.",
    next: "Магазин подключён. Публикация Etsy пока недоступна; далее добавим настройки продавца и создание черновика.",
    disconnect: "Отключение убирает доступ из OmniList, но не удаляет магазин или объявления. Отозвать разрешение приложения можно в настройках Etsy.",
    cancelled: "Подключение Etsy отменено. Предыдущее подключение не изменилось.",
    noShop: "У этого аккаунта не найден магазин Etsy. Откройте магазин продавца на Etsy и подключите его снова.",
    failed: "Не удалось подключить Etsy. Проверьте доступ приложения и повторите подключение. Предыдущее подключение не заменено.",
    scopes: "Etsy не предоставил доступ к данным магазина. Подключитесь снова и подтвердите разрешение."
  },
  uk: {
    channels: "Канали продажу", hint: "Підключіть магазин Etsy. Знайдемо його автоматично: токени та ID вводити не потрібно.",
    scope: "На цьому етапі лише читаємо дані магазину. Оголошення не створюються, не змінюються й не активуються.",
    unavailable: "Підключення Etsy ще не налаштоване на сервері.",
    next: "Магазин підключено. Публікація Etsy поки недоступна; далі додамо налаштування продавця та створення чернетки.",
    disconnect: "Відключення прибирає доступ з OmniList, але не видаляє магазин чи оголошення. Відкликати дозвіл застосунку можна в налаштуваннях Etsy.",
    cancelled: "Підключення Etsy скасовано. Попереднє підключення не змінилося.",
    noShop: "Для цього акаунта не знайдено магазин Etsy. Відкрийте магазин продавця на Etsy та підключіть його знову.",
    failed: "Не вдалося підключити Etsy. Перевірте доступ застосунку й повторіть підключення. Попереднє підключення не замінене.",
    scopes: "Etsy не надав доступ до даних магазину. Підключіться знову та підтвердьте дозвіл."
  }
};

export function etsyConnectionError(locale: Locale, code: string): string | undefined {
  const copy = etsyCopy[locale];
  if (!code.startsWith("ETSY_")) return undefined;
  if (code === "ETSY_CONNECT_CANCELLED") return copy.cancelled;
  if (code === "ETSY_SHOP_NOT_FOUND") return copy.noShop;
  if (code === "ETSY_MISSING_SCOPES") return copy.scopes;
  return copy.failed;
}
