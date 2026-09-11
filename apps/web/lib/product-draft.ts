import type { Product, ProductAsset, ProductUpsertInput } from "@omnilist/shared";

export interface ProductDraftFields {
  title: string;
  description: string;
  sku: string;
  price: string;
  quantity: string;
}

export function buildProductDraft(
  fields: ProductDraftFields,
  images: ProductAsset[],
  ebay: Product["channelOverrides"]["ebay"],
  initial?: Product
): ProductUpsertInput {
  return {
    title: fields.title.trim(),
    description: fields.description.trim(),
    sku: fields.sku.trim(),
    basePrice: fields.price.trim() ? Number(fields.price.replace(",", ".")) : NaN,
    quantity: fields.quantity.trim() ? Number(fields.quantity) : NaN,
    images,
    brand: initial?.brand,
    categoryId: initial?.categoryId,
    categoryLabel: initial?.categoryLabel,
    attributes: initial?.attributes ?? {},
    variants: initial?.variants ?? [],
    channelOverrides: { ...initial?.channelOverrides, ebay }
  };
}
