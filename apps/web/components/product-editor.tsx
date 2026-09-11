"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { productUpsertInputSchema, buildEbayAspects, type Product, type ProductAsset } from "@omnilist/shared";
import { dictionaries, type Locale } from "../lib/i18n";
import { publishCopy } from "../lib/publish-copy";
import { buildProductDraft, type ProductDraftFields } from "../lib/product-draft";
import { useFlash } from "./flash-provider";
import { EbayProductFields, type EbayProductDetails } from "./ebay-product-fields";

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image unreadable"));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function ProductEditor({ apiBaseUrl, initialProduct, locale }: {
  apiBaseUrl: string; initialProduct?: Product; locale: Locale;
}) {
  const router = useRouter();
  const { showFlash } = useFlash();
  const dictionary = dictionaries[locale];
  const text = publishCopy[locale];
  const [isPending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [readingImages, setReadingImages] = useState(false);
  const lock = useRef(false);
  const generatedSku = useRef("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [form, setForm] = useState<ProductDraftFields>(() => ({
    title: initialProduct?.title ?? "", description: initialProduct?.description ?? "",
    sku: initialProduct?.sku ?? "", price: initialProduct ? String(initialProduct.basePrice) : "",
    quantity: String(initialProduct?.quantity ?? 1)
  }));
  const [images, setImages] = useState<ProductAsset[]>(initialProduct?.images ?? []);
  const initialOverride = initialProduct?.channelOverrides.ebay;
  const [categoryId, setCategoryId] = useState(initialOverride?.categoryId ?? "");
  const [details, setDetails] = useState<EbayProductDetails>({
    condition: initialOverride?.condition ?? "", conditionDescription: initialOverride?.conditionDescription ?? "",
    aspects: initialOverride?.aspects ?? {}
  });
  const [override, setOverride] = useState({
    title: initialOverride?.title ?? "", description: initialOverride?.description ?? "",
    price: initialOverride?.price === undefined ? "" : String(initialOverride.price)
  });
  const baseAspects = initialProduct ? buildEbayAspects({ ...initialProduct, channelOverrides: {} }) : {};

  function update(key: keyof ProductDraftFields, value: string) {
    setForm(current => ({ ...current, [key]: value }));
    setFieldErrors(current => ({ ...current, [key === "price" ? "basePrice" : key]: undefined }));
  }

  async function addImages(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    setReadingImages(true);
    try {
      const added = await Promise.all(files.map(async file => ({ id: crypto.randomUUID(), url: await readImage(file), altText: file.name })));
      setImages(current => [...current, ...added]);
    } catch {
      showFlash({ tone: "error", message: dictionary.productEditor.couldNotReadFile });
    } finally {
      input.value = "";
      setReadingImages(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || readingImages) return;
    setError("");
    setFieldErrors({});
    generatedSku.current ||= crypto.randomUUID();
    const payload = buildProductDraft({ ...form, sku: form.sku.trim() || generatedSku.current }, images, {
      ...initialOverride,
      title: override.title.trim() || undefined,
      description: override.description.trim() || undefined,
      price: override.price.trim() ? Number(override.price.replace(",", ".")) : undefined,
      categoryId: categoryId.trim() || undefined,
      condition: details.condition || undefined,
      conditionDescription: details.conditionDescription.trim() || undefined,
      aspects: Object.fromEntries(Object.entries(details.aspects).map(([name, values]) => [name, values.map(value => value.trim()).filter(Boolean)]))
    }, initialProduct);
    const parsed = productUpsertInputSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors);
      setError(dictionary.productEditor.reviewErrors);
      return;
    }
    lock.current = true;
    setSaving(true);
    try {
      const response = await fetch(apiBaseUrl + "/products" + (initialProduct ? "/" + initialProduct.id : ""), {
        method: initialProduct ? "PUT" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data)
      });
      const body = await response.json().catch(() => undefined) as { item?: Product; message?: string; issues?: { fieldErrors?: Record<string, string[]> } } | undefined;
      if (!response.ok || !body?.item) {
        setFieldErrors(body?.issues?.fieldErrors ?? {});
        throw new Error(body?.message || dictionary.productEditor.couldNotSaveProduct);
      }
      const id = body.item.id;
      startTransition(() => { router.push(`/products/${id}`); router.refresh(); });
    } catch (err) {
      setError(err instanceof Error ? err.message : dictionary.productEditor.couldNotSaveProduct);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  const busy = saving || isPending;
  return <form onSubmit={save} className="listing-editor">
    <fieldset disabled={busy} className="listing-fieldset">
      <section className="listing-section" aria-labelledby="product-basics">
        <header><h2 id="product-basics">{text.basics}</h2><p className="muted">{text.basicsHint}</p></header>
        <div className="field">
          <span>{dictionary.productEditor.productPhotos}</span>
          <p className="field-hint">{text.photosHint}</p>
          <div className="listing-photos">
            {images.map((image, index) => <div className="listing-photo" key={image.id}>
              {/* Local uploads are previewed before the API stores their public URLs. */}
              <img src={image.url} alt={image.altText || form.title} />
              {index === 0 ? <span className="pill">{text.cover}</span> : <button type="button" className="button-secondary" onClick={() => setImages(current => [image, ...current.filter(item => item.id !== image.id)])}>{text.mainPhoto}</button>}
              <button type="button" className="button-secondary" onClick={() => setImages(current => current.filter(item => item.id !== image.id))}>{dictionary.productEditor.remove}</button>
            </div>)}
          </div>
          <label className="field"><span>{dictionary.productEditor.uploadedImages}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={readingImages} onChange={addImages} /></label>
          {fieldErrors.images ? <span className="field-error">{fieldErrors.images.join(" ")}</span> : null}
        </div>
        <label className="field"><span>{dictionary.productEditor.title}</span><input required minLength={3} maxLength={80} value={form.title} onChange={event => update("title", event.target.value)} /><span className="field-hint">{form.title.length} / 80</span></label>
        <label className="field"><span>{dictionary.productEditor.description}</span><textarea required minLength={10} rows={5} value={form.description} onChange={event => update("description", event.target.value)} /></label>
        <div className="editor-grid">
          <label className="field"><span>{text.price}</span><input required inputMode="decimal" value={form.price} onChange={event => update("price", event.target.value)} />{fieldErrors.basePrice ? <span className="field-error">{fieldErrors.basePrice.join(" ")}</span> : null}</label>
          <label className="field"><span>{text.count}</span><input required type="number" min={0} step={1} value={form.quantity} onChange={event => update("quantity", event.target.value)} />{fieldErrors.quantity ? <span className="field-error">{fieldErrors.quantity.join(" ")}</span> : null}</label>
        </div>
      </section>
      <section className="listing-section" aria-labelledby="ebay-details">
        <header><h2 id="ebay-details">{text.ebay}</h2><p className="muted">{text.ebayHint}</p></header>
        <EbayProductFields apiBaseUrl={apiBaseUrl} categoryId={categoryId} onCategoryChange={setCategoryId} value={details} onChange={setDetails} baseAspects={baseAspects} locale={locale} />
        {fieldErrors.channelOverrides ? <p className="field-error">{fieldErrors.channelOverrides.join(" ")}</p> : null}
      </section>
    </fieldset>
    <details className="listing-section" open={Boolean(fieldErrors.sku)}>
      <summary>{text.advanced}</summary>
      <fieldset disabled={busy} className="listing-fieldset">
        <label className="field"><span>{dictionary.productEditor.sku}</span><input maxLength={50} value={form.sku} onChange={event => update("sku", event.target.value)} /><span className="field-hint">{text.skuHint}</span></label>
        <details open={Boolean(initialOverride?.title || initialOverride?.description || initialOverride?.price !== undefined)}>
          <summary>{text.overrides}</summary><p className="field-hint">{text.overridesHint}</p>
          <div className="editor-grid">
            <label className="field"><span>{dictionary.productEditor.title}</span><input maxLength={80} value={override.title} onChange={event => setOverride({ ...override, title: event.target.value })} /></label>
            <label className="field"><span>{text.price}</span><input inputMode="decimal" value={override.price} onChange={event => setOverride({ ...override, price: event.target.value })} /></label>
            <label className="field field-full"><span>{dictionary.productEditor.description}</span><textarea rows={3} value={override.description} onChange={event => setOverride({ ...override, description: event.target.value })} /></label>
          </div>
        </details>
        {initialProduct?.variants.length ? <p className="issue warning">{text.variants}</p> : null}
      </fieldset>
    </details>
    {error ? <p role="alert" className="issue blocking">{error}</p> : null}
    <footer className="listing-save">
      <span className="field-hint">{text.draftHint}</span>
      <button className="button-primary" type="submit" disabled={busy || readingImages}>{busy ? text.saving : text.save}</button>
    </footer>
  </form>;
}
