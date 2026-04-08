"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { channels, getMappedCategoryLabel, productUpsertInputSchema, suggestCategoriesFromText, type ChannelId, type Product, type ProductAsset } from "@omnilist/shared";

import { dictionaries, type Locale } from "../lib/i18n";

interface ProductEditorProps {
  apiBaseUrl: string;
  initialProduct?: Product;
  locale: Locale;
}

interface FormState {
  title: string;
  description: string;
  brand: string;
  sku: string;
  basePrice: string;
  quantity: string;
  categoryId: string;
  categoryLabel: string;
  material: string;
  color: string;
  primaryColor: string;
}

type FormFieldName = keyof FormState | "images";
type FormFieldErrors = Partial<Record<FormFieldName, string[]>>;

interface VariantDraft {
  id: string;
  sku: string;
  price: string;
  quantity: string;
  optionName: string;
  optionValue: string;
  secondOptionName: string;
  secondOptionValue: string;
}

type VariantFieldName =
  | "sku"
  | "price"
  | "quantity"
  | "optionName"
  | "optionValue"
  | "secondOptionName"
  | "secondOptionValue";

type VariantFieldErrors = Partial<Record<VariantFieldName, string>>;

interface ChannelOverrideDraft {
  title: string;
  description: string;
  price: string;
}

type ChannelOverrideErrors = Partial<Record<ChannelId, { price?: string }>>;

function buildInitialState(product?: Product): FormState {
  return {
    title: product?.title ?? "",
    description: product?.description ?? "",
    brand: product?.brand ?? "",
    sku: product?.sku ?? "",
    basePrice: product ? String(product.basePrice) : "",
    quantity: product ? String(product.quantity) : "",
    categoryId: product?.categoryId ?? "",
    categoryLabel: product?.categoryLabel ?? "",
    material: product?.attributes.material ?? "",
    color: product?.attributes.color ?? "",
    primaryColor: product?.attributes.primary_color ?? ""
  };
}

function createEmptyVariant(): VariantDraft {
  return {
    id: crypto.randomUUID(),
    sku: "",
    price: "",
    quantity: "",
    optionName: "",
    optionValue: "",
    secondOptionName: "",
    secondOptionValue: ""
  };
}

function buildInitialVariants(product?: Product): VariantDraft[] {
  return (
    product?.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      price: String(variant.price),
      quantity: String(variant.quantity),
      optionName: variant.options[0]?.name ?? "",
      optionValue: variant.options[0]?.value ?? "",
      secondOptionName: variant.options[1]?.name ?? "",
      secondOptionValue: variant.options[1]?.value ?? ""
    })) ?? []
  );
}

function buildInitialOverrides(product?: Product): Record<ChannelId, ChannelOverrideDraft> {
  return {
    shopify: {
      title: product?.channelOverrides.shopify?.title ?? "",
      description: product?.channelOverrides.shopify?.description ?? "",
      price: product?.channelOverrides.shopify?.price !== undefined ? String(product.channelOverrides.shopify.price) : ""
    },
    ebay: {
      title: product?.channelOverrides.ebay?.title ?? "",
      description: product?.channelOverrides.ebay?.description ?? "",
      price: product?.channelOverrides.ebay?.price !== undefined ? String(product.channelOverrides.ebay.price) : ""
    },
    etsy: {
      title: product?.channelOverrides.etsy?.title ?? "",
      description: product?.channelOverrides.etsy?.description ?? "",
      price: product?.channelOverrides.etsy?.price !== undefined ? String(product.channelOverrides.etsy.price) : ""
    }
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Could not read file."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function parseDecimalInput(value: string) {
  return Number(value.trim().replace(",", "."));
}

function parseIntegerInput(value: string) {
  return Number(value.trim());
}

export function ProductEditor({ apiBaseUrl, initialProduct, locale }: ProductEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const dictionary = dictionaries[locale];
  const [form, setForm] = useState<FormState>(() => buildInitialState(initialProduct));
  const [images, setImages] = useState<ProductAsset[]>(() => initialProduct?.images ?? []);
  const [variants, setVariants] = useState<VariantDraft[]>(() => buildInitialVariants(initialProduct));
  const [channelOverrides, setChannelOverrides] = useState<Record<ChannelId, ChannelOverrideDraft>>(() => buildInitialOverrides(initialProduct));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FormFieldErrors>({});
  const [variantErrors, setVariantErrors] = useState<VariantFieldErrors[]>([]);
  const [channelOverrideErrors, setChannelOverrideErrors] = useState<ChannelOverrideErrors>({});

  const isEditing = Boolean(initialProduct);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    try {
      const nextImages = await Promise.all(
        files.map(async (file) => ({
          id: crypto.randomUUID(),
          url: await fileToDataUrl(file),
          altText: file.name
        }))
      );

      setImages((current) => [...current, ...nextImages]);
      setFieldErrors((current) => ({
        ...current,
        images: undefined
      }));
      event.target.value = "";
    } catch {
      setError(dictionary.productEditor.couldNotReadFile);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    setVariantErrors([]);
    setChannelOverrideErrors({});

    if (!apiBaseUrl) {
      setError(dictionary.productEditor.missingApi);
      return;
    }

    const basePrice = parseDecimalInput(form.basePrice);
    const quantity = parseIntegerInput(form.quantity);

    if (!Number.isFinite(basePrice) || basePrice < 0) {
      setError(dictionary.productEditor.reviewErrors);
      setFieldErrors({
        basePrice: [dictionary.productEditor.validBasePrice]
      });
      return;
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      setError(dictionary.productEditor.reviewErrors);
      setFieldErrors({
        quantity: [dictionary.productEditor.validQuantity]
      });
      return;
    }

    const payload = {
      title: form.title,
      description: form.description,
      brand: form.brand || undefined,
      sku: form.sku,
      basePrice,
      quantity,
      categoryId: form.categoryId || undefined,
      categoryLabel: form.categoryLabel || undefined,
      images: images.map((image, index) => ({
        id: image.id,
        url: image.url,
        altText: image.altText || dictionary.productEditor.productImageAlt(form.title, index + 1)
      })),
      attributes: Object.fromEntries(
        Object.entries({
          material: form.material,
          color: form.color,
          primary_color: form.primaryColor
        }).filter(([, value]) => value.trim().length > 0)
      ),
      variants: variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku.trim(),
        price: parseDecimalInput(variant.price),
        quantity: parseIntegerInput(variant.quantity),
        options: [
          {
            name: variant.optionName.trim(),
            value: variant.optionValue.trim()
          },
          {
            name: variant.secondOptionName.trim(),
            value: variant.secondOptionValue.trim()
          }
        ].filter((option) => option.name.length > 0 && option.value.length > 0)
      })),
      channelOverrides: Object.fromEntries(
        channels.flatMap((channel) => {
          const override = channelOverrides[channel.id];
          const parsedPrice = override.price.trim().length > 0 ? parseDecimalInput(override.price) : undefined;
          const nextOverride = {
            title: override.title.trim() || undefined,
            description: override.description.trim() || undefined,
            price: parsedPrice
          };

          return nextOverride.title || nextOverride.description || nextOverride.price !== undefined
            ? [[channel.id, nextOverride]]
            : [];
        })
      )
    };

    const nextChannelOverrideErrors = channels.reduce<ChannelOverrideErrors>((currentErrors, channel) => {
      const draft = channelOverrides[channel.id];

      if (draft.price.trim().length === 0) {
        return currentErrors;
      }

      const parsedPrice = parseDecimalInput(draft.price);

      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        currentErrors[channel.id] = {
          price: dictionary.productEditor.invalidOverridePrice
        };
      }

      return currentErrors;
    }, {});

    if (Object.keys(nextChannelOverrideErrors).length > 0) {
      setError(dictionary.productEditor.reviewErrors);
      setChannelOverrideErrors(nextChannelOverrideErrors);
      return;
    }

    const nextVariantErrors = payload.variants.map((variant, index) => {
      const draft = variants[index];
      const currentErrors: VariantFieldErrors = {};
      const hasPrimaryOptionInput = draft.optionName.trim().length > 0 || draft.optionValue.trim().length > 0;
      const hasSecondaryOptionInput =
        draft.secondOptionName.trim().length > 0 || draft.secondOptionValue.trim().length > 0;

      if (variant.sku.length === 0) {
        currentErrors.sku = dictionary.productEditor.variantSkuRequired;
      }

      if (!Number.isFinite(variant.price) || variant.price < 0) {
        currentErrors.price = dictionary.productEditor.variantPriceInvalid;
      }

      if (!Number.isInteger(variant.quantity) || variant.quantity < 0) {
        currentErrors.quantity = dictionary.productEditor.variantQuantityInvalid;
      }

      if (hasPrimaryOptionInput && !(draft.optionName.trim().length > 0 && draft.optionValue.trim().length > 0)) {
        currentErrors.optionName = dictionary.productEditor.variantOptionPairInvalid;
        currentErrors.optionValue = dictionary.productEditor.variantOptionPairInvalid;
      }

      if (
        hasSecondaryOptionInput &&
        !(draft.secondOptionName.trim().length > 0 && draft.secondOptionValue.trim().length > 0)
      ) {
        currentErrors.secondOptionName = dictionary.productEditor.variantOptionPairInvalid;
        currentErrors.secondOptionValue = dictionary.productEditor.variantOptionPairInvalid;
      }

      return currentErrors;
    });

    if (nextVariantErrors.some((entry) => Object.keys(entry).length > 0)) {
      setError(dictionary.productEditor.reviewErrors);
      setVariantErrors(nextVariantErrors);
      return;
    }

    const validation = productUpsertInputSchema.safeParse(payload);

    if (!validation.success) {
      setError(dictionary.productEditor.reviewErrors);
      setFieldErrors(validation.error.flatten().fieldErrors as FormFieldErrors);
      return;
    }

    const endpoint = isEditing ? `${apiBaseUrl}/products/${initialProduct?.id}` : `${apiBaseUrl}/products`;
    const method = isEditing ? "PUT" : "POST";

    const response = await fetch(endpoint, {
      method,
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as
        | {
            message?: string;
            issues?: {
              fieldErrors?: Record<string, string[]>;
            };
          }
        | undefined;

      if (body?.issues?.fieldErrors) {
        setFieldErrors(body.issues.fieldErrors as FormFieldErrors);
      }

      setError(body?.message ?? dictionary.productEditor.couldNotSaveProduct);
      return;
    }

    const data = (await response.json()) as { item: Product };

    startTransition(() => {
      router.push(`/products/${data.item.id}`);
      router.refresh();
    });
  }

  function updateField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
    setFieldErrors((current) => ({
      ...current,
      [key]: undefined
    }));
  }

  function updateVariant(index: number, key: VariantFieldName, value: string) {
    setVariants((current) =>
      current.map((variant, variantIndex) =>
        variantIndex === index
          ? {
              ...variant,
              [key]: value
            }
          : variant
      )
    );

    setVariantErrors((current) =>
      current.map((variantError, variantIndex) =>
        variantIndex === index
          ? {
              ...variantError,
              [key]: undefined
            }
          : variantError
      )
    );
  }

  function removeImage(imageId: string) {
    setImages((current) => current.filter((image) => image.id !== imageId));
  }

  function addVariant() {
    setVariants((current) => [...current, createEmptyVariant()]);
    setVariantErrors((current) => [...current, {}]);
  }

  function removeVariant(index: number) {
    setVariants((current) => current.filter((_, variantIndex) => variantIndex !== index));
    setVariantErrors((current) => current.filter((_, variantIndex) => variantIndex !== index));
  }

  function getFieldError(key: FormFieldName) {
    return fieldErrors[key]?.[0];
  }

  function updateChannelOverride(channelId: ChannelId, key: keyof ChannelOverrideDraft, value: string) {
    setChannelOverrides((current) => ({
      ...current,
      [channelId]: {
        ...current[channelId],
        [key]: value
      }
    }));

    setChannelOverrideErrors((current) => ({
      ...current,
      [channelId]: {
        ...current[channelId],
        ...(key === "price" ? { price: undefined } : {})
      }
    }));
  }

  const suggestedCategories = suggestCategoriesFromText(
    [form.title, form.description, form.material, form.color, form.primaryColor].filter(Boolean).join(" ")
  );

  return (
    <form className="editor-form" onSubmit={handleSubmit}>
      <div className="editor-grid">
        <label className="field">
          <span>{dictionary.productEditor.title}</span>
          <input value={form.title} onChange={(event) => updateField("title", event.target.value)} required />
          {getFieldError("title") ? <span className="field-error">{getFieldError("title")}</span> : null}
        </label>

        <label className="field">
          <span>{dictionary.productEditor.brand}</span>
          <input value={form.brand} onChange={(event) => updateField("brand", event.target.value)} />
          {getFieldError("brand") ? <span className="field-error">{getFieldError("brand")}</span> : null}
        </label>

        <label className="field field-full">
          <span>{dictionary.productEditor.description}</span>
          <textarea
            rows={6}
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            required
          />
          {getFieldError("description") ? <span className="field-error">{getFieldError("description")}</span> : null}
        </label>

        <label className="field">
          <span>{dictionary.productEditor.sku}</span>
          <input value={form.sku} onChange={(event) => updateField("sku", event.target.value)} required />
          {getFieldError("sku") ? <span className="field-error">{getFieldError("sku")}</span> : null}
        </label>

        <label className="field">
          <span>{dictionary.productEditor.basePrice}</span>
          <input
            inputMode="decimal"
            value={form.basePrice}
            onChange={(event) => updateField("basePrice", event.target.value)}
            required
          />
          {getFieldError("basePrice") ? <span className="field-error">{getFieldError("basePrice")}</span> : null}
        </label>

        <label className="field">
          <span>{dictionary.productEditor.quantity}</span>
          <input
            inputMode="numeric"
            value={form.quantity}
            onChange={(event) => updateField("quantity", event.target.value)}
            required
          />
          {getFieldError("quantity") ? <span className="field-error">{getFieldError("quantity")}</span> : null}
        </label>

        <label className="field">
          <span>{dictionary.productEditor.categoryId}</span>
          <input value={form.categoryId} onChange={(event) => updateField("categoryId", event.target.value)} />
          {getFieldError("categoryId") ? <span className="field-error">{getFieldError("categoryId")}</span> : null}
        </label>

        <label className="field">
          <span>{dictionary.productEditor.categoryLabel}</span>
          <input value={form.categoryLabel} onChange={(event) => updateField("categoryLabel", event.target.value)} />
          {getFieldError("categoryLabel") ? <span className="field-error">{getFieldError("categoryLabel")}</span> : null}
        </label>

        <div className="field field-full">
          <span>{dictionary.productEditor.categorySuggestions}</span>
          <span className="field-hint">{dictionary.productEditor.categorySuggestionsHint}</span>
          {suggestedCategories.length === 0 ? (
            <div className="upload-empty">{dictionary.productEditor.noCategorySuggestions}</div>
          ) : (
            <div className="variant-stack">
              {suggestedCategories.map((category) => (
                <div className="list-item" key={category.id}>
                  <div className="row">
                    <strong>{category.label}</strong>
                    <button
                      className="button-secondary"
                      onClick={() => {
                        updateField("categoryId", category.id);
                        updateField("categoryLabel", category.label);
                      }}
                      type="button"
                    >
                      {dictionary.productEditor.useSuggestion}
                    </button>
                  </div>
                  <div className="muted">{category.id}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="field field-full">
          <span>{dictionary.productEditor.mappedCategoryPreview}</span>
          <div className="list">
            {channels.map((channel) => (
              <div className="list-item" key={channel.id}>
                <div className="row">
                  <strong>{channel.name}</strong>
                  <span className="pill">{channel.id}</span>
                </div>
                <div className="muted">
                  {getMappedCategoryLabel(form.categoryId, channel.id) ?? form.categoryLabel ?? dictionary.dashboard.categoryMappingMissing}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="field field-full">
          <span>{dictionary.productEditor.channelOverrides}</span>
          <span className="field-hint">{dictionary.productEditor.channelOverridesHint}</span>
          <div className="variant-stack">
            {channels.map((channel) => (
              <div className="variant-card" key={channel.id}>
                <div className="row">
                  <strong>{dictionary.productEditor.overrideSectionFor(channel.name)}</strong>
                  <span className="pill">{channel.id}</span>
                </div>
                <div className="variant-grid">
                  <label className="field">
                    <span>{dictionary.productEditor.overrideTitle}</span>
                    <input
                      value={channelOverrides[channel.id].title}
                      onChange={(event) => updateChannelOverride(channel.id, "title", event.target.value)}
                    />
                  </label>

                  <label className="field">
                    <span>{dictionary.productEditor.overridePrice}</span>
                    <input
                      inputMode="decimal"
                      value={channelOverrides[channel.id].price}
                      onChange={(event) => updateChannelOverride(channel.id, "price", event.target.value)}
                    />
                    {channelOverrideErrors[channel.id]?.price ? (
                      <span className="field-error">{channelOverrideErrors[channel.id]?.price}</span>
                    ) : null}
                  </label>

                  <label className="field field-full">
                    <span>{dictionary.productEditor.overrideDescription}</span>
                    <textarea
                      rows={4}
                      value={channelOverrides[channel.id].description}
                      onChange={(event) => updateChannelOverride(channel.id, "description", event.target.value)}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="field field-full">
          <span>{dictionary.productEditor.productPhotos}</span>
          <input accept="image/*" multiple onChange={handleFileChange} type="file" />
          <span className="field-hint">{dictionary.productEditor.productPhotosHint}</span>
          {getFieldError("images") ? <span className="field-error">{getFieldError("images")}</span> : null}
        </label>

        <div className="field field-full">
          <span>{dictionary.productEditor.uploadedImages}</span>
          {images.length === 0 ? (
            <div className="upload-empty">{dictionary.productEditor.noImagesUploaded}</div>
          ) : (
            <div className="image-grid">
              {images.map((image, index) => (
                <div className="image-card" key={image.id}>
                  <img alt={image.altText ?? dictionary.productEditor.productImageAlt(form.title, index + 1)} className="image-preview" src={image.url} />
                  <div className="row">
                    <span className="muted">{index === 0 ? dictionary.productEditor.mainImage : dictionary.productEditor.imageN(index + 1)}</span>
                    <button className="image-remove" onClick={() => removeImage(image.id)} type="button">
                      {dictionary.productEditor.remove}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <label className="field">
          <span>{dictionary.productEditor.material}</span>
          <input value={form.material} onChange={(event) => updateField("material", event.target.value)} />
          {getFieldError("material") ? <span className="field-error">{getFieldError("material")}</span> : null}
        </label>

        <label className="field">
          <span>{dictionary.productEditor.color}</span>
          <input value={form.color} onChange={(event) => updateField("color", event.target.value)} />
          {getFieldError("color") ? <span className="field-error">{getFieldError("color")}</span> : null}
        </label>

        <label className="field">
          <span>{dictionary.productEditor.primaryColor}</span>
          <input value={form.primaryColor} onChange={(event) => updateField("primaryColor", event.target.value)} />
          {getFieldError("primaryColor") ? <span className="field-error">{getFieldError("primaryColor")}</span> : null}
        </label>

        <div className="field field-full">
          <div className="row">
            <span>{dictionary.productEditor.variants}</span>
            <button className="button-secondary" onClick={addVariant} type="button">
              {dictionary.productEditor.addVariant}
            </button>
          </div>
          <span className="field-hint">{dictionary.productEditor.variantsHint}</span>
          {variants.length === 0 ? (
            <div className="upload-empty">{dictionary.productEditor.noVariantsConfigured}</div>
          ) : (
            <div className="variant-stack">
              {variants.map((variant, index) => (
                <div className="variant-card" key={variant.id}>
                  <div className="row">
                    <strong>{dictionary.productEditor.variantN(index + 1)}</strong>
                    <button className="image-remove" onClick={() => removeVariant(index)} type="button">
                      {dictionary.productEditor.removeVariant}
                    </button>
                  </div>
                  <div className="variant-grid">
                    <label className="field">
                      <span>{dictionary.productEditor.variantSku}</span>
                      <input value={variant.sku} onChange={(event) => updateVariant(index, "sku", event.target.value)} />
                      {variantErrors[index]?.sku ? <span className="field-error">{variantErrors[index]?.sku}</span> : null}
                    </label>

                    <label className="field">
                      <span>{dictionary.productEditor.variantPrice}</span>
                      <input
                        inputMode="decimal"
                        value={variant.price}
                        onChange={(event) => updateVariant(index, "price", event.target.value)}
                      />
                      {variantErrors[index]?.price ? <span className="field-error">{variantErrors[index]?.price}</span> : null}
                    </label>

                    <label className="field">
                      <span>{dictionary.productEditor.variantQuantity}</span>
                      <input
                        inputMode="numeric"
                        value={variant.quantity}
                        onChange={(event) => updateVariant(index, "quantity", event.target.value)}
                      />
                      {variantErrors[index]?.quantity ? <span className="field-error">{variantErrors[index]?.quantity}</span> : null}
                    </label>

                    <label className="field">
                      <span>{dictionary.productEditor.optionName}</span>
                      <input value={variant.optionName} onChange={(event) => updateVariant(index, "optionName", event.target.value)} />
                      {variantErrors[index]?.optionName ? <span className="field-error">{variantErrors[index]?.optionName}</span> : null}
                    </label>

                    <label className="field">
                      <span>{dictionary.productEditor.optionValue}</span>
                      <input value={variant.optionValue} onChange={(event) => updateVariant(index, "optionValue", event.target.value)} />
                      {variantErrors[index]?.optionValue ? <span className="field-error">{variantErrors[index]?.optionValue}</span> : null}
                    </label>

                    <label className="field">
                      <span>{dictionary.productEditor.secondOptionName}</span>
                      <input
                        value={variant.secondOptionName}
                        onChange={(event) => updateVariant(index, "secondOptionName", event.target.value)}
                      />
                      {variantErrors[index]?.secondOptionName ? (
                        <span className="field-error">{variantErrors[index]?.secondOptionName}</span>
                      ) : null}
                    </label>

                    <label className="field">
                      <span>{dictionary.productEditor.secondOptionValue}</span>
                      <input
                        value={variant.secondOptionValue}
                        onChange={(event) => updateVariant(index, "secondOptionValue", event.target.value)}
                      />
                      {variantErrors[index]?.secondOptionValue ? (
                        <span className="field-error">{variantErrors[index]?.secondOptionValue}</span>
                      ) : null}
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error ? <div className="banner error">{error}</div> : null}

      <div className="editor-actions">
        <button className="button-primary" disabled={isPending} type="submit">
          {isPending ? dictionary.common.saving : isEditing ? dictionary.common.saveProduct : dictionary.productEditor.createProduct}
        </button>
      </div>
    </form>
  );
}
