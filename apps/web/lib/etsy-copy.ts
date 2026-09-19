import type { Locale } from "./i18n";

export const etsyCopy = {
  en: {
    loadSetup: "Load shop settings", loadingSetup: "Loading settings...", setupTitle: "Existing Etsy settings",
    setupHint: "Read-only check. These profiles will be selectable when preparing a product; nothing is selected or saved automatically.",
    shipping: "Shipping profiles", returns: "Return policies", processing: "Processing profiles",
    empty: "None found. Configure this in Etsy Shop Manager, then load again.", shopManager: "Open Etsy Shop Manager",
    acceptsReturns: "Returns accepted", noReturns: "No returns", exchanges: "Exchanges accepted", noExchanges: "No exchanges", days: "days",
    madeToOrder: "Made to order", readyToShip: "Ready to ship", setupFailed: "Could not load the full settings. No listings were changed. Try again.",
    reconnect: "Etsy access has expired or lacks permission. Reconnect the shop.", rateLimited: "Etsy request limit reached. Wait a little before trying again.",
    changed: "The connection changed. Reload the page before loading settings again.", busy: "Another request is updating this connection. Try again shortly.",
    channels: "Sales channels", hint: "Connect your Etsy shop securely. OmniList finds the shop automatically; no tokens or IDs to paste.",
    scope: "This step only reads shop details. It does not create, change or activate listings.",
    unavailable: "Etsy connection is not configured on this server yet.",
    next: "Shop linked. You can check existing settings below. Product checks and draft creation are next; Etsy publishing is not available yet.",
    disconnect: "Disconnect removes access from OmniList, not the shop or its listings. You can also revoke the app in Etsy settings.",
    cancelled: "Etsy connection was cancelled. Your previous connection was not changed.",
    noShop: "No Etsy shop was found for this account. Open your seller shop on Etsy, then connect again.",
    failed: "Could not connect Etsy. Check the app access and try Connect again. Your previous connection was not replaced.",
    scopes: "Etsy did not grant the required shop permission. Connect again and approve shop access."
  },
  ru: {
    loadSetup: "Загрузить настройки магазина", loadingSetup: "Загружаем настройки...", setupTitle: "Настройки из Etsy",
    setupHint: "Только просмотр. Выбор этих профилей появится при подготовке товара; сейчас ничего не выбираем и не сохраняем автоматически.",
    shipping: "Профили доставки", returns: "Правила возврата", processing: "Сроки подготовки заказа",
    empty: "Не найдены. Настройте их в Etsy Shop Manager и загрузите снова.", shopManager: "Открыть Etsy Shop Manager",
    acceptsReturns: "Возврат разрешён", noReturns: "Без возврата", exchanges: "Обмен разрешён", noExchanges: "Без обмена", days: "дней",
    madeToOrder: "Изготовление на заказ", readyToShip: "Готово к отправке", setupFailed: "Не удалось загрузить полный набор настроек. Объявления не изменены. Попробуйте снова.",
    reconnect: "Доступ Etsy истёк или недостаточно разрешений. Переподключите магазин.", rateLimited: "Достигнут лимит запросов Etsy. Подождите перед повторной попыткой.",
    changed: "Подключение изменилось. Обновите страницу и загрузите настройки снова.", busy: "Другой запрос обновляет подключение. Повторите чуть позже.",
    channels: "Каналы продаж", hint: "Подключите магазин Etsy. Найдём его автоматически: токены и ID вводить не нужно.",
    scope: "На этом этапе только читаем данные магазина. Объявления не создаются, не изменяются и не активируются.",
    unavailable: "Подключение Etsy ещё не настроено на сервере.",
    next: "Магазин подключён. Ниже можно проверить его настройки. Далее добавим проверку товара и черновик; публикация Etsy пока недоступна.",
    disconnect: "Отключение убирает доступ из OmniList, но не удаляет магазин или объявления. Отозвать разрешение приложения можно в настройках Etsy.",
    cancelled: "Подключение Etsy отменено. Предыдущее подключение не изменилось.",
    noShop: "У этого аккаунта не найден магазин Etsy. Откройте магазин продавца на Etsy и подключите его снова.",
    failed: "Не удалось подключить Etsy. Проверьте доступ приложения и повторите подключение. Предыдущее подключение не заменено.",
    scopes: "Etsy не предоставил доступ к данным магазина. Подключитесь снова и подтвердите разрешение."
  },
  uk: {
    loadSetup: "Завантажити налаштування магазину", loadingSetup: "Завантажуємо налаштування...", setupTitle: "Налаштування з Etsy",
    setupHint: "Лише перегляд. Вибір цих профілів з'явиться під час підготовки товару; зараз нічого не обираємо й не зберігаємо автоматично.",
    shipping: "Профілі доставки", returns: "Правила повернення", processing: "Строки підготовки замовлення",
    empty: "Не знайдені. Налаштуйте їх у Etsy Shop Manager і завантажте знову.", shopManager: "Відкрити Etsy Shop Manager",
    acceptsReturns: "Повернення дозволене", noReturns: "Без повернення", exchanges: "Обмін дозволений", noExchanges: "Без обміну", days: "днів",
    madeToOrder: "Виготовлення на замовлення", readyToShip: "Готово до відправлення", setupFailed: "Не вдалося завантажити повний набір налаштувань. Оголошення не змінені. Спробуйте знову.",
    reconnect: "Доступ Etsy сплив або бракує дозволів. Перепідключіть магазин.", rateLimited: "Досягнуто ліміт запитів Etsy. Зачекайте перед повторною спробою.",
    changed: "Підключення змінилося. Оновіть сторінку й завантажте налаштування знову.", busy: "Інший запит оновлює підключення. Повторіть трохи пізніше.",
    channels: "Канали продажу", hint: "Підключіть магазин Etsy. Знайдемо його автоматично: токени та ID вводити не потрібно.",
    scope: "На цьому етапі лише читаємо дані магазину. Оголошення не створюються, не змінюються й не активуються.",
    unavailable: "Підключення Etsy ще не налаштоване на сервері.",
    next: "Магазин підключено. Нижче можна перевірити його налаштування. Далі додамо перевірку товару та чернетку; публікація Etsy поки недоступна.",
    disconnect: "Відключення прибирає доступ з OmniList, але не видаляє магазин чи оголошення. Відкликати дозвіл застосунку можна в налаштуваннях Etsy.",
    cancelled: "Підключення Etsy скасовано. Попереднє підключення не змінилося.",
    noShop: "Для цього акаунта не знайдено магазин Etsy. Відкрийте магазин продавця на Etsy та підключіть його знову.",
    failed: "Не вдалося підключити Etsy. Перевірте доступ застосунку й повторіть підключення. Попереднє підключення не замінене.",
    scopes: "Etsy не надав доступ до даних магазину. Підключіться знову та підтвердьте дозвіл."
  }
};

export function etsySetupError(locale: Locale, code?: string) {
  const copy = etsyCopy[locale];
  if (code === "ETSY_RECONNECT_REQUIRED") return copy.reconnect;
  if (code === "ETSY_RATE_LIMITED") return copy.rateLimited;
  if (code === "ETSY_CONNECTION_CHANGED") return copy.changed;
  if (code === "ETSY_CONNECTION_BUSY") return copy.busy;
  return copy.setupFailed;
}

export function etsyConnectionError(locale: Locale, code: string): string | undefined {
  const copy = etsyCopy[locale];
  if (!code.startsWith("ETSY_")) return undefined;
  if (code === "ETSY_CONNECT_CANCELLED") return copy.cancelled;
  if (code === "ETSY_SHOP_NOT_FOUND") return copy.noShop;
  if (code === "ETSY_MISSING_SCOPES") return copy.scopes;
  return copy.failed;
}
