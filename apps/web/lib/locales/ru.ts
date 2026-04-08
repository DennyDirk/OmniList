export const ru = {
  meta: {
    title: "OmniList",
    description: "Создай один раз, публикуй везде."
  },
  layout: {
    language: "Язык",
    localeNames: {
      en: "English",
      uk: "Українська",
      ru: "Русский"
    }
  },
  common: {
    appName: "OmniList",
    account: "Аккаунт OmniList",
    or: "или",
    backToDashboard: "Назад к дашборду",
    backToWorkspace: "Назад в рабочее пространство",
    createProduct: "Создать товар",
    editProduct: "Редактировать товар",
    manageChannels: "Управлять каналами",
    openProductWorkspace: "Открыть рабочее пространство товара",
    saveProduct: "Сохранить товар",
    addFirstProduct: "Добавить первый товар",
    saveChannelSettings: "Сохранить настройки канала",
    saving: "Сохранение...",
    refreshing: "Обновление...",
    type: "Тип",
    region: "Регион",
    accountLabel: "Аккаунт",
    notConnectedYet: "Еще не подключено",
    score: "Оценка",
    skuLabel: "SKU",
    inStock: "в наличии",
    recentJobs: "Последние задачи",
    publishing: "Публикация",
    canonicalProductModel: "Каноническая модель товара",
    billing: "Биллинг",
    upgradeToPro: "Перейти на Pro",
    managePlan: "Управлять планом",
    currentPlan: "Текущий план"
  },
  channels: {
    kindLabels: {
      store: "Магазин",
      marketplace: "Маркетплейс"
    },
    descriptions: {
      shopify: "Подключенный e-commerce канал и исходный каталог.",
      ebay: "Сильный SMB-маркетплейс со зрелой поддержкой листингов и таксономии.",
      etsy: "Маркетплейс с хорошим fit для handmade, нишевых и креативных товаров."
    }
  },
  statuses: {
    connected: "Подключено",
    disconnected: "Отключено",
    attentionRequired: "Требует внимания",
    ready: "Готово",
    needsAttention: "Требует внимания",
    queued: "В очереди",
    processing: "Обрабатывается",
    completed: "Завершено",
    partial: "Частично",
    failed: "Ошибка",
    published: "Опубликовано"
  },
  loginPage: {
    title: "Войдите в кабинет продавца",
    description: "Ваш каталог, подключения каналов и пайплайн публикации должны находиться в приватном workspace, а не на общей странице.",
    needAccount: "Нужен аккаунт?",
    createOne: "Создать"
  },
  registerPage: {
    title: "Создайте свой личный кабинет продавца",
    description: "Регистрация создает приватный workspace, поэтому товары и подключенные каналы принадлежат авторизованному пользователю.",
    alreadyHaveAccount: "Уже есть аккаунт?",
    signIn: "Войти"
  },
  authForm: {
    name: "Имя",
    workspaceName: "Название workspace",
    email: "Email",
    password: "Пароль",
    oauthFailed: "Ошибка OAuth-входа",
    authFailed: "Не удалось выполнить аутентификацию.",
    missingApi: "Запусти API на localhost:4000 или укажи NEXT_PUBLIC_OMNILIST_API_URL.",
    pleaseWait: "Подождите...",
    signIn: "Войти",
    createAccount: "Создать аккаунт"
  },
  socialAuth: {
    continueWith: (providerName: string) => `Продолжить через ${providerName}`,
    notConfigured: (providerName: string) => `${providerName} еще не настроен`
  },
  logoutButton: {
    signingOut: "Выход...",
    signOut: "Выйти"
  },
  dashboard: {
    eyebrow: "OmniList MVP",
    title: "Создай один раз. Публикуй уверенно.",
    description: (workspaceName: string) =>
      `${workspaceName} уже получил первый реальный слой кабинета продавца: канонические товары, подключенные каналы, мультиканальную readiness-проверку и понятную обратную связь перед публикацией.`,
    signedInAs: (email: string) => `Вход выполнен как ${email}`,
    stats: {
      productsInCatalog: "Товаров в каталоге",
      connectedChannels: "Подключенных каналов",
      listingsReadyNow: "Объявлений готово сейчас",
      productsRemaining: "Товаров осталось",
      listingsNeedingAttention: "Объявлений требуют внимания"
    },
    channelWorkspaceTitle: "Рабочее пространство каналов",
    channelWorkspaceDescription: "Понимание того, какие каналы уже достаточно подготовлены для публикации.",
    manageChannel: (channelName: string) => `Управлять ${channelName}`,
    catalogSnapshotTitle: "Срез каталога",
    catalogSnapshotDescription: "Каждая карточка показывает готовность к публикации по каналам.",
    workspaceReadyTitle: "Ваш workspace готов",
    workspaceReadyDescription: "Товаров пока нет. Создайте первый канонический товар, а затем подключайте поверх него publish flow.",
    readyEverywhere: "Готово везде",
    channelsBlocked: (count: number) => `Заблокировано каналов: ${count}`,
    categoryMappingMissing: "Маппинг категории пока отсутствует",
    noIssuesDetected: "Для этого канала проблем не найдено.",
    issuesToReview: (count: number) => `Нужно проверить проблем: ${count}.`,
    publishCenterTitle: "Центр публикации",
    publishCenterDescription: "Последние асинхронные задачи публикации по workspace.",
    noPublishJobs: "Задач публикации пока нет. Открой рабочее пространство товара, чтобы начать."
  },
  channelsPage: {
    eyebrow: "Рабочее пространство каналов",
    title: "Подключайте каналы продаж, не выходя из кабинета.",
    description: (workspaceName: string) =>
      `${workspaceName} может управлять состоянием маркетплейсов из одного места: account reference, sync mode и рабочая заметка перед публикацией.`,
    connected: (count: number) => `Подключено: ${count}`,
    needsAttention: (count: number) => `Требуют внимания: ${count}`,
    availableChannels: "Доступные каналы",
    connectedNow: "Подключено сейчас",
    needAttention: "Требует внимания",
    manageConnections: "Управление подключениями",
    manageConnectionsDescription: "Сохраняй состояние канала уже сейчас; позже сюда подключатся полноценные OAuth-адаптеры."
  },
  channelManager: {
    status: "Статус",
    externalAccountId: "Внешний ID аккаунта",
    syncMode: "Режим синхронизации",
    syncModeHint: "Примеры: `listing_only`, `listing_and_inventory`, `catalog_and_inventory`.",
    internalNote: "Внутренняя заметка",
    notePlaceholder: "Нужна повторная авторизация, ожидает проверки, подключено через саппорт и т.д.",
    connectionGuidance: "Подсказка по подключению",
    region: "Регион",
    guidanceDescription: "Используй эту карточку, чтобы отслеживать связку с аккаунтом продавца до того, как мы подключим полный OAuth/channel-specific flow.",
    couldNotSave: "Не удалось сохранить подключение канала.",
    savedConnection: (channelName: string) => `Подключение ${channelName} сохранено.`
  },
  newProductPage: {
    title: "Создать товар",
    description: "Начните с канонической карточки товара. Адаптация под конкретные каналы будет накладываться поверх этой модели."
  },
  editProductPage: {
    title: "Редактировать товар",
    description: "Сначала обновите канонические данные товара. Readiness и качество публикации автоматически улучшатся по каждому каналу."
  },
  productEditor: {
    couldNotReadFile: "Не удалось прочитать один из выбранных файлов изображений.",
    missingApi: "Для сохранения нужен запущенный API и NEXT_PUBLIC_OMNILIST_API_URL.",
    couldNotSaveProduct: "Не удалось сохранить товар.",
    reviewErrors: "Пожалуйста, проверьте подсвеченные поля.",
    validBasePrice: "Введите корректное неотрицательное число.",
    validQuantity: "Введите корректное неотрицательное целое число.",
    title: "Название",
    brand: "Бренд",
    description: "Описание",
    sku: "SKU",
    basePrice: "Базовая цена",
    quantity: "Количество",
    categoryId: "ID категории",
    categoryLabel: "Название категории",
    categorySuggestions: "Рекомендуемые категории",
    categorySuggestionsHint: "OmniList может подсказать внутренние категории на основе названия, описания и атрибутов товара.",
    noCategorySuggestions: "Пока нет подсказок по категориям. Добавьте более точное название или подробное описание.",
    useSuggestion: "Использовать подсказку",
    mappedCategoryPreview: "Предпросмотр категорий каналов",
    channelOverrides: "Переопределения по каналам",
    channelOverridesHint: "Переопределяйте title, description или price только когда конкретному маркетплейсу нужна своя версия листинга.",
    overrideTitle: "Переопределить title",
    overrideDescription: "Переопределить description",
    overridePrice: "Переопределить цену",
    overrideSectionFor: (channelName: string) => `Переопределение для ${channelName}`,
    invalidOverridePrice: "Цена переопределения должна быть корректным неотрицательным числом.",
    productPhotos: "Фото товара",
    productPhotosHint: "Загружайте фото с устройства. Первое изображение считается основным.",
    uploadedImages: "Загруженные изображения",
    noImagesUploaded: "Изображения еще не загружены.",
    variants: "Варианты",
    variantsHint: "Добавляйте размеры, цвета и другие комбинации с собственными SKU, остатком и ценой.",
    noVariantsConfigured: "Варианты еще не добавлены.",
    addVariant: "Добавить вариант",
    removeVariant: "Удалить вариант",
    variantN: (index: number) => `Вариант ${index}`,
    variantSku: "SKU варианта",
    variantPrice: "Цена варианта",
    variantQuantity: "Количество варианта",
    optionName: "Название опции",
    optionValue: "Значение опции",
    secondOptionName: "Название второй опции",
    secondOptionValue: "Значение второй опции",
    variantSkuRequired: "SKU варианта обязателен.",
    variantPriceInvalid: "Цена варианта должна быть корректным неотрицательным числом.",
    variantQuantityInvalid: "Количество варианта должно быть корректным неотрицательным целым числом.",
    variantOptionPairInvalid: "Заполните и название, и значение опции либо оставьте оба поля пустыми.",
    mainImage: "Главное изображение",
    imageN: (index: number) => `Изображение ${index}`,
    remove: "Удалить",
    material: "Материал",
    color: "Цвет",
    primaryColor: "Основной цвет",
    productImageAlt: (title: string, index: number) => `${title || "Товар"} изображение ${index}`,
    createProduct: "Создать товар"
  },
  productWorkspace: {
    description:
      "Этот workspace объединяет validation-first редактирование и асинхронный publish center, чтобы продавец мог проверить готовность, запустить публикацию и увидеть результат по каждому каналу.",
    readinessScore: "Оценка готовности",
    listingReady: "Это объявление готово для этого канала.",
    publishingDescription: "Асинхронные задачи позволяют публиковать сейчас и проверять результаты по каналам по мере завершения.",
    noProductJobs: "Для этого товара еще нет задач публикации.",
    canonicalDescription: "Исходная сущность, которую будущие адаптеры каналов будут преобразовывать во внешние листинги.",
    coreFields: "Основные поля",
    basePrice: "Базовая цена",
    stock: "Остаток",
    category: "Категория",
    notMappedYet: "Еще не замаплено",
    attributes: "Атрибуты",
    noAttributes: "Обогащенные атрибуты пока не добавлены.",
    variants: "Варианты",
    noVariants: "Варианты не настроены.",
    units: "шт."
  },
  publishCard: {
    title: "Центр публикации",
    connected: (count: number) => `Подключено: ${count}`,
    description: "Поставьте задачу публикации в очередь, и OmniList отдельно оценит каждый выбранный канал.",
    missingApi: "Запустите API перед стартом задач публикации.",
    selectChannel: "Выберите хотя бы один подключенный канал.",
    enqueueFailed: "Не удалось поставить задачу публикации в очередь.",
    publishToSelected: "Опубликовать в выбранные каналы"
  },
  billingPage: {
    eyebrow: "Монетизация",
    title: "Выберите план под ваш объем продаж.",
    description: "Free подходит для старта и проверки. Pro открывает неограниченное количество товаров и будущий AI-tooling для серьезных мультиканальных продавцов.",
    currentUsage: "Текущее использование",
    productUsage: (count: number, limit: number | null) => (limit === null ? `Использовано товаров: ${count}` : `Использовано ${count} из ${limit} товаров`),
    aiIncluded: "AI включен",
    aiNotIncluded: "AI не включен",
    activePlan: "Активный план",
    switchToFree: "Переключить на Free",
    switchToPro: "Активировать Pro",
    processing: "Обновление плана...",
    updated: "План успешно обновлен."
  }
} as const;
