# Анализ OmniMarket — Текущее состояние и дальнейшие шаги (2026-09-14)

## Что было сделано с Codex (2026-09-04 по 2026-09-13)

### Основные фиксы в ebay-publish.adapter.ts:

1. **Сериализация eBay item specifics** ✅
   - Brand, Material, Color теперь отправляются как массивы `["Nike"]` вместо строк
   - Коммит: 752e341

2. **Детальные eBay ошибки** ✅
   - Вместо `Invalid request` теперь видны: message, longMessage, parameters
   - Коммит: 08c95db

3. **Accept-Language header** ✅
   - Исправлена отправка `Accept-Language: en-US` вместе с `Content-Language`
   - Это был техничский фикс для compliance с eBay REST docs

4. **Валидация категории и условия** ✅
   - Функция `validateEbayCategory()` в ebay-listing.ts проверяет:
     - Выбранное condition соответствует требованиям категории
     - Все required aspects есть
     - Condition поддерживается MVP (не экзотические grading)
   - Коммит: множество изменений в 24 файлах (+918/-493)

5. **Загрузка категории requirements** ✅
   - `getEbayCategoryRequirements()` в ebay-category.ts
   - Вызывает Taxonomy API → Category Requirements API
   - Возвращает полный список допустимых conditions и aspects

### Текущий блокер: Condition mismatch

```
Shirt: Failed
eBay publish offer failed.: 
Condition information 1000 does not exists or is not a valid 
condition for category 261328
```

**Причина:** Была скопирована категория `261328` (Trading Card Singles) из примера Barry Bonds rookie card. Для рубашки нужна совсем другая категория.

**Решение:** 
1. Найти правильную категорию для рубашки через Taxonomy API
   - Query: `men t shirt` или `women casual shirt`
   - Взять подходящий `categoryId`
2. Обновить eBay override для Shirt товара
3. Повторить publish

---

## Новая стратегия (обновлено 2026-09-13)

### Стратегический поворот:

**Было:** Shopify интеграция как Phase 3  
**Стало:** P0 publishing-пилот (eBay + Etsy), затем импорт каталога

**Ключевые принципы:**
- Не проценты, а состояния: "Готово", "Нужно заполнить", "Не поддерживается", "Не проверено"
- Published ≠ Ready; оба независимы
- Repair/retry — часть P0, не Phase 2
- Детерминированные исправления только (без AI угадывания)
- Два равноправных пути: create новый товар OR импортировать существующий

---

## P0 фазы (пересмотрено после Codex работы)

### P0.0: Минимальная безопасность — **В РАБОТЕ** 🔴 BLOCKER

**Реализовано:**
- ✅ Claim + offer verification
- ✅ needs_review флаг при неоднозначности
- ✅ SQL 0006 и 0007 миграции

**НЕ готово:**
- ❌ Полные concurrency-тесты (2 запроса, DB failure, timeout after create, account change)
- ❌ User repair flow (getEbayOfferStatus() существует, но не интегрирована)
- ❌ Восстановление после рестарта
- ❌ Test на production build

**Статус:** 34 теста выполнены; новые механизмы claim/offer verification требуют отдельных тестов.

---

### P0.1: Единая серверная readiness — **НЕ ЗАВЕРШЕНО**

**Текущее состояние:**
- `validateEbayCategory()` существует и работает
- `getEbayCategoryRequirements()` загружает requirements
- Но проверки распределены между shared, UI и adapter

**Что нужно объединить:**
- ✅ Общие правила (title length, SKU length, price > 0, images)
- ✅ eBay category requirements (condition, aspects)
- ❌ Shop config validation (marketplace, currency, policies)
- ❌ Connection auth checks
- ❌ Единый output format (не array of strings, а structured issues)

**Текущая проблема Shirt:**
- Валидация запустилась ДО публикации (хорошо!)
- Но пользователь выбрал неправильную категорию изначально
- И система не подсказала ему, что 261328 — это для Trading Cards, не для одежды

---

### P0.2: Первый полный eBay UX — **НЕ ЗАВЕРШЕНО**

**Желаемый сценарий:**
```
1. Создать товар (title, description, price, images)
2. Выбрать eBay (если подключён)
3. Выбрать категорию (показать suggestions от Taxonomy API)
4. Увидеть requirements (condition, aspects)
5. Заполнить требуемые поля
6. Проверить валидность
7. Preview
8. Publish
9. Ссылка на объявление
```

**Текущее состояние:**
- Шаги 1-2 работают
- Шаг 3: есть select, но нет suggestions от Taxonomy API
- Шаг 4: requirements загружаются, но не показываются в UI
- Шаги 5-9: публикация работает, но ошибки иногда скрыты

**Что нужно изменить в UI:**
1. Category picker: search via Taxonomy API suggestions, не просто text input
2. Requirements panel: показать допустимые conditions и required aspects
3. Issues card: показать ровно то, что нужно исправить (не score %)
4. Apply fix: inline editing, не переходы между страницами

---

### P0.3: Etsy как второе направление — **НЕ НАЧАТО**

**Паралельно P0.2 (не блокирует):**
- OAuth PKCE
- Eligibility checks (происхождение товара)
- Taxonomy загрузка
- Draft → save listing ID → images → activation

---

### P0.4: Импорт существующего каталога — **ТЕКУЩИЙ ПРОДУКТОВЫЙ СРЕЗ** 📦

**ЧТО ГОТОВО:**
- ✅ Inventory API preview (read-only, 20 items/page)
- ✅ 39/39 тестов пройдено
- ✅ Обработка ошибок и смены подключения

**ЧТО НЕ ГОТОВО:**
- ❌ Trading API для existing active listings (GetMyeBaySelling/GetItem)
- ❌ Выбор товаров из preview
- ❌ Атомарный импорт (Product + source/listing identity)
- ❌ Защита от дублей при повторном импорте
- ❌ CSV импорт
- ❌ Shopify импорт

**Текущий статус:** Только read-only Inventory preview. Это не готовый импорт, это первый этап.

---

## Что реально работает СЕЙЧАС

```javascript
✅ Общий Product model
✅ OAuth для eBay
✅ Category tree navigation
✅ Condition + aspects requirements загрузка
✅ Publish одного SKU
✅ Error messages с деталями
✅ Item specifics serialization как массивы
✅ ChannelListing registry
✅ Inventory API preview

❌ Category picker с suggestions
❌ Repair flow (check + retry)
❌ Etsy publish
❌ CSV импорт
❌ Shopify импорт
❌ Inventory sync
```

---

## Дальнейшие шаги (рекомендуемый порядок)

### НЕДЕЛЯ 1 (Неделя 14-20 сентября)

**Пн-Вт: Завершить P0.0 safety**
- [ ] Полные concurrency-тесты
- [ ] User repair flow (endpoint + UI кнопка)
- [ ] Используй `getEbayOfferStatus()` которая уже существует

**Ср-Чт: Начать P0.1 readiness consolidation**
- [ ] Merge eBay category requirements + common validation в одном service
- [ ] Структурировать issue output (не array of strings)

**Пт: Deploy P0.0 на staging**
- [ ] E2E test с real eBay Sandbox

---

### НЕДЕЛЯ 2 (21-27 сентября)

**Пн-Вт: Продолжить P0.1 + начать P0.2 UX**
- [ ] Category picker с Taxonomy API suggestions
- [ ] Requirements panel в UI
- [ ] Issues card component

**Ср-Чт: Начать P0.3 Etsy (параллельно)**
- [ ] OAuth PKCE setup
- [ ] Eligibility checks

**Пт: P0.4 Trading API read**
- [ ] GetMyeBaySelling/GetItem для active listings

---

### НЕДЕЛЯ 3+ (После P0.0 complete)

**P0.4 завершение:**
- [ ] Trading API integration
- [ ] Atomic import (Product + source identity)
- [ ] Deduplication logic
- [ ] CSV import
- [ ] Shopify OAuth import

**P0.2 UX завершение:**
- [ ] Fix application (inline editing)
- [ ] Preview перед publish
- [ ] Link на опубликованное объявление

**P0.3 Etsy завершение:**
- [ ] Publish adapter
- [ ] Assessment с same UI contracts
- [ ] E2E test: eBay success → Etsy requires fix → retry Etsy не трогает eBay

---

## Текущая проблема с Shirt товаром

**Ошибка:**
```
Condition 1000 (NEW) не подходит категории 261328 (Trading Card Singles)
```

**Почему это произошло:**
1. Категория 261328 была выбрана из примера Barry Bonds rookie card
2. Для рубашки нужна совсем другая категория (из Men's/Women's apparel)
3. Каждая категория имеет свой список допустимых conditions
4. Condition 1000 (NEW) работает для одежды, но не для Trading Cards

**Как исправить:**
1. Запросить Taxonomy API с query `men t shirt` или `women casual shirt`
2. Выбрать подходящий categoryId (например, 15687 для Men's T-Shirts)
3. Обновить Shirt товар: eBay override → category ID = 15687
4. Повторить publish

**Почему система позволила это:**
- Валидация работает ТОЛЬКО после выбора категории
- UI не подсказывает, что 261328 — это Trading Cards
- Category picker — это текстовое поле, не search с suggestions

**Что нужно изменить:**
- Category picker должен показывать suggestions от Taxonomy API
- Перед публикацией показывать требования выбранной категории
- Если категория не подходит товару, показать это ДО попытки публикации

---

## Ключевые файлы для следующего этапа

```
P0.0 Safety:
- apps/api/src/modules/publishing/claim.service.ts
- apps/api/src/modules/channels/adapters/ebay-listing-status.ts
- Новый endpoint для repair check

P0.1 Readiness:
- apps/api/src/modules/validation/validation.service.ts (точка consolidation)
- packages/shared/src/readiness.ts (structure expand)
- packages/shared/src/ebay-listing.ts (already has validateEbayCategory)

P0.2 UX:
- apps/web/app/products/[productId]/page.tsx (main product page)
- apps/web/components/ebay-product-fields.tsx (exists, но нужен refactor)
- Новый компонент: issue card
- Новый компонент: category picker с suggestions

P0.4 Import:
- apps/api/src/modules/catalog/ebay-catalog.service.ts (exists, extend)
- apps/api/src/modules/channels/adapters/ebay-active-listings.ts (Trading API)
- Новый service: atomic import
```

---

## Что я делал до этого (НЕПРАВИЛЬНО)

❌ Создал `shopify_implementation_prep.md` — Shopify это P1, не сейчас  
❌ Исследовал Shopify API — валидная работа, но не для текущего приоритета  

**Это не выбросить, а переместить в backlog для P1 фазы.**

---

## Итоговый вывод

**Стратегия изменилась:** Не Shopify сразу, а:
1. **P0.0:** Безопасная публикация без дублей и необработанных ошибок
2. **P0.1:** Единая валидация (товар + категория + требования)
3. **P0.2:** Удобный eBay UX (suggestions, requirements, inline fixes)
4. **P0.3:** Etsy как второе направление
5. **P0.4:** Импорт существующего каталога (eBay, CSV, Shopify)

**После P0 complete → P1:** Bulk operations, AI suggestions, Shopify publish, pricing rules

**Сейчас блокирует:** P0.0 не завершён  
**Потом можно:** Параллельно P0.1 + P0.2 + P0.3 + P0.4

**Проблема Shirt товара** — это симптом, что UI не подсказывает требования категории. Исправляется в P0.2 UX redesign.
