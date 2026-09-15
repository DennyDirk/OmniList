export const ebayCatalogCopy = {
  en: {
    details: {
      open: "View details", close: "Hide details", loading: "Checking...", error: "Could not verify this listing. Reload the catalog and try again.",
      import: "Import product", importing: "Importing...", importError: "Could not import this listing. Nothing was created.",
      imported: "Product imported.", existing: "This listing is already imported.", managed: "This listing is already managed by an OmniList product.", openProduct: "Open product",
      readOnly: "Verified source data. Nothing has changed until you choose Import.",
      category: "Category", condition: "Condition", quantity: "Available quantity", price: "Price", pictures: "Pictures", aspects: "Item specifics", unknown: "Not returned by eBay",
      limitations: { variations: "Variants are not supported in the first import release.", listing_type: "Only fixed-price listings are planned for the first import release.",
        market: "The first import release is limited to eBay US / USD.", inactive: "This listing is no longer active.", missing_sku: "Add a valid SKU in eBay before importing.",
        missing_description: "Add a usable description in eBay before importing.", missing_price: "Price is unavailable; no default price will be assumed.",
        missing_quantity: "Available quantity could not be confirmed.", upstream_warning: "eBay returned a warning. Recheck before importing." }
    },
    source: "Show", active: "Active listings", activeIntro: "View active listings from your connected eBay account, including listings created outside OmniList.",
    activeNote: "Open listing details to verify the source, then import one product at a time.", importSource: "Verified eBay source",
    activeEmpty: "No active listings on this page.", unknownPrice: "Price not returned by eBay", partial: "eBay returned a warning or a limited result. This may not be the complete catalog.",
    imported: "Imported", managed: "Managed by OmniList", openProduct: "Open product",
    title: "eBay catalog", back: "Back to catalog", load: "Load from eBay", loading: "Loading...",
    intro: "Preview inventory available through the eBay Inventory API. Nothing is imported or changed in your store.",
    limitation: "Listings created directly on eBay or through other tools may not appear here. This is not a complete list of active listings. Import into OmniList is not available yet.",
    empty: "No Inventory API items on this page. Your eBay store may still contain other listings.",
    error: "Could not load the catalog. Try again.", previous: "Previous", next: "Next",
    count: "Inventory items", page: "Page", connect: "Connect eBay", readOnly: "Read-only preview",
    note: "An inventory record does not confirm that a listing is live. Prices and publication status are not checked here."
  },
  ru: {
    details: {
      open: "Подробнее", close: "Скрыть детали", loading: "Проверка...", error: "Не удалось проверить объявление. Обновите каталог и попробуйте снова.",
      import: "Импортировать товар", importing: "Импортируем...", importError: "Не удалось импортировать объявление. Товар не создан.",
      imported: "Товар импортирован.", existing: "Это объявление уже импортировано.", managed: "Объявлением уже управляет товар OmniList.", openProduct: "Открыть товар",
      readOnly: "Проверенные данные источника. До нажатия «Импортировать» ничего не изменится.",
      category: "Категория", condition: "Состояние", quantity: "Доступный остаток", price: "Цена", pictures: "Фотографии", aspects: "Характеристики", unknown: "eBay не вернул данные",
      limitations: { variations: "Варианты не поддерживаются в первом этапе импорта.", listing_type: "Первый этап импорта рассчитан только на объявления с фиксированной ценой.",
        market: "Первый этап импорта ограничен eBay US / USD.", inactive: "Объявление больше не активно.", missing_sku: "Перед импортом добавьте корректный SKU в eBay.",
        missing_description: "Перед импортом добавьте описание товара в eBay.", missing_price: "Цена недоступна. Подставлять выдуманную цену не будем.",
        missing_quantity: "Доступный остаток не подтверждён.", upstream_warning: "eBay вернул предупреждение. Перед импортом нужна повторная проверка." }
    },
    source: "Показать", active: "Активные объявления", activeIntro: "Просмотр активных объявлений подключённого eBay, включая созданные вне OmniList.",
    activeNote: "Откройте детали объявления, проверьте источник и импортируйте один товар.", importSource: "Проверенный источник eBay",
    activeEmpty: "На этой странице нет активных объявлений.", unknownPrice: "eBay не вернул цену", partial: "eBay вернул предупреждение или ограниченный результат. Здесь может быть не весь каталог.",
    imported: "Импортировано", managed: "Управляется OmniList", openProduct: "Открыть товар",
    title: "Каталог eBay", back: "Назад в каталог", load: "Загрузить из eBay", loading: "Загрузка...",
    intro: "Просмотр товаров, доступных через eBay Inventory API. Данные не импортируются и не меняются в магазине.",
    limitation: "Объявления, созданные на сайте eBay или через другие инструменты, могут здесь отсутствовать. Это не полный список активных объявлений. Импорт в OmniList пока недоступен.",
    empty: "На этой странице нет товаров Inventory API. В магазине eBay могут быть другие объявления.",
    error: "Не удалось загрузить каталог. Попробуйте ещё раз.", previous: "Назад", next: "Далее",
    count: "Товаров Inventory API", page: "Страница", connect: "Подключить eBay", readOnly: "Только просмотр",
    note: "Запись в каталоге не подтверждает, что объявление опубликовано. Цена и статус публикации здесь не проверяются."
  },
  uk: {
    details: {
      open: "Докладніше", close: "Сховати деталі", loading: "Перевірка...", error: "Не вдалося перевірити оголошення. Оновіть каталог і спробуйте знову.",
      import: "Імпортувати товар", importing: "Імпортуємо...", importError: "Не вдалося імпортувати оголошення. Товар не створено.",
      imported: "Товар імпортовано.", existing: "Це оголошення вже імпортовано.", managed: "Оголошенням уже керує товар OmniList.", openProduct: "Відкрити товар",
      readOnly: "Перевірені дані джерела. До натискання «Імпортувати» нічого не зміниться.",
      category: "Категорія", condition: "Стан", quantity: "Доступний залишок", price: "Ціна", pictures: "Фотографії", aspects: "Характеристики", unknown: "eBay не повернув дані",
      limitations: { variations: "Варіанти не підтримуються на першому етапі імпорту.", listing_type: "Перший етап імпорту розрахований лише на оголошення з фіксованою ціною.",
        market: "Перший етап імпорту обмежений eBay US / USD.", inactive: "Оголошення більше не активне.", missing_sku: "Перед імпортом додайте коректний SKU в eBay.",
        missing_description: "Перед імпортом додайте опис товару в eBay.", missing_price: "Ціна недоступна. Вигадану ціну не підставлятимемо.",
        missing_quantity: "Доступний залишок не підтверджено.", upstream_warning: "eBay повернув попередження. Перед імпортом потрібна повторна перевірка." }
    },
    source: "Показати", active: "Активні оголошення", activeIntro: "Перегляд активних оголошень підключеного eBay, включно зі створеними поза OmniList.",
    activeNote: "Відкрийте деталі оголошення, перевірте джерело та імпортуйте один товар.", importSource: "Перевірене джерело eBay",
    activeEmpty: "На цій сторінці немає активних оголошень.", unknownPrice: "eBay не повернув ціну", partial: "eBay повернув попередження або обмежений результат. Тут може бути не весь каталог.",
    imported: "Імпортовано", managed: "Керується OmniList", openProduct: "Відкрити товар",
    title: "Каталог eBay", back: "Назад до каталогу", load: "Завантажити з eBay", loading: "Завантаження...",
    intro: "Перегляд товарів, доступних через eBay Inventory API. Дані не імпортуються і не змінюються в магазині.",
    limitation: "Оголошення, створені на сайті eBay або через інші інструменти, можуть тут бути відсутні. Це не повний список активних оголошень. Імпорт до OmniList поки недоступний.",
    empty: "На цій сторінці немає товарів Inventory API. У магазині eBay можуть бути інші оголошення.",
    error: "Не вдалося завантажити каталог. Спробуйте ще раз.", previous: "Назад", next: "Далі",
    count: "Товарів Inventory API", page: "Сторінка", connect: "Підключити eBay", readOnly: "Лише перегляд",
    note: "Запис у каталозі не підтверджує публікацію оголошення. Ціна та статус публікації тут не перевіряються."
  }
};
