import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import type { ApiEnv } from "../../../config/env";
import { callEbayTradingRead, EbayTradingReadError } from "./ebay-trading-read";

const count = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative().safe());
const schema = z.object({
  Ack: z.enum(["Success", "Warning", "Failure", "PartialFailure"]),
  Errors: z.array(z.object({ SeverityCode: z.string(), ErrorCode: z.string().optional() })).optional(),
  Item: z.object({
    ItemID: z.string().regex(/^\d{1,19}$/), Title: z.string().min(1).max(1000), SKU: z.string().max(1000).optional(),
    Seller: z.object({ UserID: z.string().min(1).max(256) }), Site: z.string().min(1), ListingType: z.string().min(1),
    PrimaryCategory: z.object({ CategoryID: z.string().regex(/^\d+$/), CategoryName: z.string().optional() }).optional(),
    ConditionID: z.string().regex(/^\d+$/).optional(), ConditionDisplayName: z.string().optional(),
    Quantity: count.optional(), Variations: z.unknown().optional(), Description: z.string().max(500_000).optional(),
    PictureDetails: z.object({ PictureURL: z.array(z.string()).max(100).optional() }).optional(),
    ItemSpecifics: z.object({ NameValueList: z.array(z.object({ Name: z.string().min(1).max(256), Value: z.array(z.string().max(4000)).max(100) })).max(250).optional() }).optional(),
    SellingStatus: z.object({ ListingStatus: z.string().min(1), QuantitySold: count.optional(),
      CurrentPrice: z.object({ "#text": z.string().regex(/^\d+(\.\d+)?$/), "@_currencyID": z.string().regex(/^[A-Z]{3}$/) }).optional() })
  }).optional()
});

function parseEbayItemResponse(xml: string, listingId: string) {
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new EbayTradingReadError();
  let value: unknown;
  try {
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false,
      isArray: name => ["Errors", "NameValueList", "Value", "PictureURL"].includes(name) });
    value = parser.parse(xml).GetItemResponse;
  } catch { throw new EbayTradingReadError(); }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new EbayTradingReadError();
  const response = parsed.data;
  if (["Failure", "PartialFailure"].includes(response.Ack) || response.Errors?.some(error => error.SeverityCode === "Error")) {
    throw new EbayTradingReadError(response.Errors?.some(error => ["931", "932", "16110", "21917053"].includes(error.ErrorCode ?? "")));
  }
  const item = response.Item;
  if (!item || item.ItemID !== listingId) throw new EbayTradingReadError();
  const sold = item.SellingStatus.QuantitySold;
  if (sold !== undefined && item.Quantity !== undefined && sold > item.Quantity) throw new EbayTradingReadError();
  const details = {
    listingId: item.ItemID, sellerId: item.Seller.UserID, title: item.Title, sku: item.SKU || undefined,
    site: item.Site, listingType: item.ListingType, listingStatus: item.SellingStatus.ListingStatus,
    category: item.PrimaryCategory ? { id: item.PrimaryCategory.CategoryID, name: item.PrimaryCategory.CategoryName } : undefined,
    condition: item.ConditionID ? { id: item.ConditionID, name: item.ConditionDisplayName } : undefined,
    price: item.SellingStatus.CurrentPrice ? { value: item.SellingStatus.CurrentPrice["#text"], currency: item.SellingStatus.CurrentPrice["@_currencyID"] } : undefined,
    quantity: sold !== undefined && item.Quantity !== undefined ? item.Quantity - sold : undefined,
    hasVariations: Object.prototype.hasOwnProperty.call(item, "Variations"),
    aspects: (item.ItemSpecifics?.NameValueList ?? []).map(aspect => ({ name: aspect.Name, values: aspect.Value })),
    pictureCount: item.PictureDetails?.PictureURL?.length ?? 0, hasDescription: Boolean(item.Description?.trim()),
    warning: response.Ack === "Warning"
  };
  return { details, description: item.Description, pictureUrls: item.PictureDetails?.PictureURL ?? [] };
}

export function parseEbayItemDetails(xml: string, listingId: string) {
  return parseEbayItemResponse(xml, listingId).details;
}

export function parseEbayItemImportData(xml: string, listingId: string) {
  const parsed = parseEbayItemResponse(xml, listingId);
  return { ...parsed.details, description: parsed.description, pictureUrls: parsed.pictureUrls };
}

export async function readEbayItemDetails(env: ApiEnv, token: string, listingId: string) {
  if (!/^\d{1,19}$/.test(listingId)) throw new EbayTradingReadError();
  const xml = await callEbayTradingRead(env, token, "GetItem",
    `<ItemID>${listingId}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeItemSpecifics>true</IncludeItemSpecifics>`);
  return parseEbayItemDetails(xml, listingId);
}

export async function readEbayItemImportData(env: ApiEnv, token: string, listingId: string) {
  if (!/^\d{1,19}$/.test(listingId)) throw new EbayTradingReadError();
  const xml = await callEbayTradingRead(env, token, "GetItem",
    `<ItemID>${listingId}</ItemID><DetailLevel>ReturnAll</DetailLevel><IncludeItemSpecifics>true</IncludeItemSpecifics>`);
  return parseEbayItemImportData(xml, listingId);
}

export type EbayItemImportData = ReturnType<typeof parseEbayItemImportData>;
