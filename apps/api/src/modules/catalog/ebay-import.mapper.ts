import { productUpsertInputSchema, type ProductUpsertInput } from "@omnilist/shared";
import type { EbayItemImportData } from "../channels/adapters/ebay-item-details";

export class EbayImportMappingError extends Error { readonly status = 422; }

function decodeEntities(value: string) {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (match, entity: string) => {
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? match;
    const code = Number.parseInt(entity.slice(entity[1]?.toLowerCase() === "x" ? 2 : 1), entity[1]?.toLowerCase() === "x" ? 16 : 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : " ";
  });
}

export function ebayDescriptionToPlainText(value: string | undefined) {
  if (!value) return "";
  const withoutExecutable = value.replace(/<(script|style|template|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  return decodeEntities(withoutExecutable).replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ").replace(/\r/g, "").replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 50_000);
}

function trustedPictureUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port
      || (host !== "ebayimg.com" && !host.endsWith(".ebayimg.com"))) return undefined;
    url.hash = "";
    return url.toString();
  } catch { return undefined; }
}

export function mapEbayItemToProduct(item: EbayItemImportData): ProductUpsertInput {
  const title = item.title.trim();
  const sku = item.sku?.trim();
  const description = ebayDescriptionToPlainText(item.description);
  if (item.hasVariations) throw new EbayImportMappingError("Listings with variants are not supported yet.");
  if (item.listingType !== "FixedPriceItem" || item.listingStatus !== "Active") {
    throw new EbayImportMappingError("Only active fixed-price listings can be imported.");
  }
  if (item.site !== "US" || item.price?.currency !== "USD") {
    throw new EbayImportMappingError("The first import release supports only eBay US listings in USD.");
  }
  if (title.length < 3 || title.length > 255 || !sku || sku.length > 128) {
    throw new EbayImportMappingError("The listing needs a valid SKU and title before it can be imported.");
  }
  if (description.length < 10) throw new EbayImportMappingError("The listing needs a usable description before it can be imported.");
  if (item.quantity === undefined || !item.price || !/^\d{1,10}(\.\d{1,2})?$/.test(item.price.value)) {
    throw new EbayImportMappingError("The listing price or available quantity could not be confirmed.");
  }
  const price = Number(item.price.value);
  if (!Number.isFinite(price) || price > 9_999_999_999.99) throw new EbayImportMappingError("The listing price is outside the supported range.");
  const attributes: Record<string, string> = {};
  for (const aspect of item.aspects) {
    const name = aspect.name.trim();
    const values = aspect.values.map(value => value.trim()).filter(Boolean);
    if (name && values.length) attributes[name] = [...new Set(values)].join(", ");
  }
  const brandEntry = Object.entries(attributes).find(([name]) => name.toLowerCase() === "brand");
  const pictures = [...new Set(item.pictureUrls.map(trustedPictureUrl).filter((url): url is string => Boolean(url)))];
  return productUpsertInputSchema.parse({
    title, description, brand: brandEntry?.[1], sku, basePrice: price, currency: "USD", quantity: item.quantity,
    categoryId: item.category?.id, categoryLabel: item.category?.name,
    images: pictures.map((url, index) => ({ id: `ebay-${item.listingId}-${index + 1}`, url, altText: title })),
    attributes, variants: [], channelOverrides: {}
  });
}
