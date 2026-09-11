"use client";

import { useEffect, useRef, useState } from "react";
import { validateEbayCategory, type EbayCategoryRequirements } from "@omnilist/shared";
import type { Locale } from "../lib/i18n";
import { publishCopy } from "../lib/publish-copy";
import { EbayCategoryPicker } from "./ebay-category-picker";

export interface EbayProductDetails {
  condition: string;
  conditionDescription: string;
  aspects: Record<string, string[]>;
}

const labels = {
  en: { category: "eBay category ID", check: "Check category", loading: "Checking eBay...", hint: "Use the category for the actual product, not an example ID. Check its name below before saving.", condition: "Item condition", choose: "Choose...", description: "Condition details (wear, defects, missing tags)", specifics: "Item specifics", required: "Required", optional: "More item specifics", checked: "Requirements loaded. Complete the fields and save the product before publishing.", error: "Could not check the category. Try again.", unsupported: "Requires grading; not supported yet", many: "One value per line", find: "Browse eBay categories" },
  ru: { category: "ID категории eBay", check: "Проверить категорию", loading: "Проверяем eBay...", hint: "Выберите категорию самого товара, а не ID из примера. Перед сохранением проверьте название ниже.", condition: "Состояние товара", choose: "Выберите...", description: "Подробности состояния (износ, дефекты, отсутствие бирок)", specifics: "Характеристики товара", required: "Обязательно", optional: "Другие характеристики", checked: "Требования загружены. Заполните поля и сохраните товар перед публикацией.", error: "Не удалось проверить категорию. Попробуйте ещё раз.", unsupported: "Требует оценки; пока не поддерживается", many: "Одно значение на строку", find: "Посмотреть категории eBay" },
  uk: { category: "ID категорії eBay", check: "Перевірити категорію", loading: "Перевіряємо eBay...", hint: "Оберіть категорію самого товару, а не ID з прикладу. Перед збереженням перевірте назву нижче.", condition: "Стан товару", choose: "Оберіть...", description: "Деталі стану (знос, дефекти, відсутність бірок)", specifics: "Характеристики товару", required: "Обов'язково", optional: "Інші характеристики", checked: "Вимоги завантажені. Заповніть поля та збережіть товар перед публікацією.", error: "Не вдалося перевірити категорію. Спробуйте ще раз.", unsupported: "Потребує оцінки; поки не підтримується", many: "Одне значення на рядок", find: "Переглянути категорії eBay" }
};

export function EbayProductFields({ apiBaseUrl, categoryId, onCategoryChange, value, onChange, baseAspects, locale }: {
  apiBaseUrl: string;
  categoryId: string;
  onCategoryChange: (value: string) => void;
  value: EbayProductDetails;
  onChange: (value: EbayProductDetails) => void;
  baseAspects: Record<string, string[]>;
  locale: Locale;
}) {
  const text = labels[locale];
  const copy = publishCopy[locale];
  const [choosing, setChoosing] = useState(!categoryId);
  const [revision, setRevision] = useState(0);
  const [requirements, setRequirements] = useState<EbayCategoryRequirements>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const aspects = { ...baseAspects, ...value.aspects };
  const issues = requirements ? validateEbayCategory(requirements, value.condition, aspects) : [];

  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    setRequirements(undefined);
    setError("");
    if (!/^\d{1,12}$/.test(categoryId.trim())) { setLoading(false); return; }
    setLoading(true);
    async function load() {
      try {
        const response = await fetch(apiBaseUrl + "/channel-connections/ebay/category-requirements?categoryId=" + encodeURIComponent(categoryId.trim()), { credentials: "include", signal: controller.signal });
        const body = await response.json() as { item?: EbayCategoryRequirements; message?: string };
        if (!response.ok || !body.item) throw new Error(body.message || text.error);
        if (id === requestId.current && !controller.signal.aborted) setRequirements(body.item);
      } catch (err) {
        if (id === requestId.current && !controller.signal.aborted) setError(err instanceof Error ? err.message : text.error);
      } finally {
        if (id === requestId.current && !controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [apiBaseUrl, categoryId, revision, text.error]);

  function selectCategory(id: string) {
    if (id !== categoryId) onChange({ condition: "", conditionDescription: "", aspects: {} });
    onCategoryChange(id);
    setChoosing(false);
  }

  function renderAspect(aspect: EbayCategoryRequirements["aspects"][number]) {
    const values = aspects[aspect.name] ?? [];
    const options = aspect.values.filter(item => !item.constraints?.some(constraint => !constraint.values.some(allowed => aspects[constraint.name]?.includes(allowed))));
    const update = (values: string[]) => onChange({ ...value, aspects: { ...value.aspects, [aspect.name]: values } });
    return <label className="field" key={aspect.name}>
      <span>{aspect.name}{aspect.required ? ` (${text.required})` : ""}</span>
      {aspect.selectionOnly ? <select
        multiple={aspect.multiple}
        value={aspect.multiple ? values : values[0] ?? ""}
        onChange={event => update(Array.from(event.target.selectedOptions).map(option => option.value).filter(Boolean))}
      >
        {!aspect.multiple ? <option value="">{text.choose}</option> : null}
        {values.filter(value => !options.some(option => option.value === value)).map(value => <option key={value} value={value}>{value} (invalid)</option>)}
        {options.map(option => <option key={option.value} value={option.value}>{option.value}</option>)}
      </select> : aspect.multiple ? <textarea
        rows={3} value={values.join("\n")} placeholder={text.many}
        onChange={event => update(event.target.value.split("\n"))}
      /> : <input value={values[0] ?? ""} maxLength={aspect.maxLength} onChange={event => update(event.target.value ? [event.target.value] : [])} />}
    </label>;
  }

  return <section className="field field-full" aria-label="eBay">
    {choosing ? <EbayCategoryPicker apiBaseUrl={apiBaseUrl} locale={locale} onSelect={selectCategory} /> : <div className="row">
      <strong>{requirements?.categoryName || (loading ? text.loading : copy.category + " " + categoryId)}</strong>
      <button type="button" className="button-secondary" onClick={() => setChoosing(true)}>{copy.change}</button>
    </div>}
    <details>
      <summary>{copy.manual}</summary>
      <label className="field"><span>{text.category}</span><input inputMode="numeric" value={categoryId} onChange={event => {
        ++requestId.current;
        setRequirements(undefined);
        onCategoryChange(event.target.value);
      }} /><span className="field-hint">{text.hint}</span></label>
    </details>
    {loading ? <p role="status" className="field-hint">{text.loading}</p> : null}
    {error ? <div role="alert"><p className="field-error">{error}</p><button type="button" className="button-secondary" onClick={() => setRevision(value => value + 1)}>{copy.retry}</button></div> : null}
    {!requirements && value.condition ? <p className="field-hint">{text.condition}: {value.condition}</p> : null}
    {requirements ? <>
      {choosing ? <strong>{requirements.categoryName}</strong> : null}
      <label className="field">
        <span>{text.condition}</span>
        <span className="field-hint">{copy.conditionHint}</span>
        <select value={value.condition} onChange={event => onChange({ ...value, condition: event.target.value })}>
          <option value="">{text.choose}</option>
          {value.condition && !requirements.conditions.some(item => item.value === value.condition) ? <option value={value.condition}>{value.condition} (invalid)</option> : null}
          {requirements.conditions.map(item => <option key={item.value} value={item.value} disabled={!item.supported}>{item.label}{!item.supported ? ` (${text.unsupported})` : ""}</option>)}
        </select>
      </label>
      <details open={Boolean(value.conditionDescription)}><summary>{text.description}</summary>
      <label className="field">
        <textarea rows={2} maxLength={1000} value={value.conditionDescription} onChange={event => onChange({ ...value, conditionDescription: event.target.value })} />
      </label>
      </details>
      <strong>{text.specifics}</strong>
      <div className="variant-grid">{requirements.aspects.filter(item => item.required).map(renderAspect)}</div>
      <details>
        <summary>{text.optional}</summary>
        <div className="variant-grid">{requirements.aspects.filter(item => !item.required).map(renderAspect)}</div>
      </details>
      <p className="field-hint" role="status">{issues.length ? text.required + ": " + issues.length : text.checked}</p>

    </> : null}
  </section>;
}
