"use client";

import { useRef, useState } from "react";
import { validateEbayCategory, type EbayCategoryRequirements } from "@omnilist/shared";
import type { Locale } from "../lib/i18n";

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
  const [requirements, setRequirements] = useState<EbayCategoryRequirements>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const aspects = { ...baseAspects, ...value.aspects };
  const issues = requirements ? validateEbayCategory(requirements, value.condition, aspects) : [];

  async function checkCategory() {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    setRequirements(undefined);
    try {
      const response = await fetch(`${apiBaseUrl}/channel-connections/ebay/category-requirements?categoryId=${encodeURIComponent(categoryId.trim())}`, { credentials: "include" });
      const body = await response.json() as { item?: EbayCategoryRequirements; message?: string };
      if (!response.ok || !body.item) throw new Error(body.message || text.error);
      if (id === requestId.current) setRequirements(body.item);
    } catch (error) {
      if (id === requestId.current) setError(error instanceof Error ? error.message : text.error);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
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
    <label className="field">
      <span>{text.category}</span>
      <input inputMode="numeric" value={categoryId} onChange={event => {
        ++requestId.current;
        setRequirements(undefined);
        setError("");
        setLoading(false);
        onCategoryChange(event.target.value);
      }} />
      <span className="field-hint">{text.hint}</span>
    </label>
    <div className="row">
      <button className="button-secondary" disabled={loading || !/^\d{1,12}$/.test(categoryId.trim())} onClick={() => void checkCategory()} type="button">{loading ? text.loading : text.check}</button>
      <a href="https://www.ebay.com/n/all-categories" target="_blank" rel="noreferrer">{text.find}</a>
    </div>
    {error ? <p role="alert" className="field-error">{error}</p> : null}
    {!requirements && value.condition ? <p className="field-hint">{text.condition}: {value.condition}</p> : null}
    {requirements ? <>
      <strong>{requirements.categoryName} ({requirements.categoryId}) / {requirements.marketplaceId}</strong>
      <label className="field">
        <span>{text.condition}</span>
        <select value={value.condition} onChange={event => onChange({ ...value, condition: event.target.value })}>
          <option value="">{text.choose}</option>
          {value.condition && !requirements.conditions.some(item => item.value === value.condition) ? <option value={value.condition}>{value.condition} (invalid)</option> : null}
          {requirements.conditions.map(item => <option key={item.value} value={item.value} disabled={!item.supported}>{item.label}{!item.supported ? ` (${text.unsupported})` : ""}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{text.description}</span>
        <textarea rows={2} maxLength={1000} value={value.conditionDescription} onChange={event => onChange({ ...value, conditionDescription: event.target.value })} />
      </label>
      <strong>{text.specifics}</strong>
      <div className="variant-grid">{requirements.aspects.filter(item => item.required || ["Brand", "Material", "Color"].includes(item.name)).map(renderAspect)}</div>
      <details>
        <summary>{text.optional}</summary>
        <div className="variant-grid">{requirements.aspects.filter(item => !item.required && !["Brand", "Material", "Color"].includes(item.name)).map(renderAspect)}</div>
      </details>
      {issues.length ? <ul className="field-error">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : null}
      <p className="field-hint" role="status">{text.checked}</p>
    </> : null}
  </section>;
}
