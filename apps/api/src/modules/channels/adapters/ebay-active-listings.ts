import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import type { ApiEnv } from "../../../config/env";
import { callEbayTradingRead, EbayTradingReadError } from "./ebay-trading-read";
export { EbayTradingReadError } from "./ebay-trading-read";

const count = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative().safe());
const responseSchema = z.object({
  Ack: z.enum(["Success", "Warning", "Failure", "PartialFailure"]),
  Errors: z.array(z.object({ SeverityCode: z.string(), ErrorCode: z.string().optional() })).optional(),
  ActiveList: z.object({
    PaginationResult: z.object({ TotalNumberOfEntries: count, TotalNumberOfPages: count }),
    ItemArray: z.union([z.literal(""), z.object({ Item: z.array(z.object({
      ItemID: z.string().regex(/^\d+$/), Title: z.string().min(1), SKU: z.string().optional(),
      ListingType: z.string().min(1), QuantityAvailable: count.optional(),
      SellingStatus: z.object({ CurrentPrice: z.object({
        "#text": z.string().regex(/^\d+(\.\d+)?$/), "@_currencyID": z.string().regex(/^[A-Z]{3}$/)
      }).optional() }).optional()
    })).max(200).optional() })]).optional()
  }).optional()
});

export function parseActiveListings(xml: string, page: number) {
  // eBay responses do not need DTDs; reject them before any entity expansion.
  if (xml.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) {
    throw new EbayTradingReadError();
  }
  let value: unknown;
  try {
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false,
      removeNSPrefix: true, isArray: name => name === "Item" || name === "Errors" });
    value = parser.parse(xml).GetMyeBaySellingResponse;
  } catch { throw new EbayTradingReadError(); }
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) throw new EbayTradingReadError();
  const result = parsed.data;
  if (result.Ack === "Failure" || result.Ack === "PartialFailure" || result.Errors?.some(e => e.SeverityCode === "Error")) {
    throw new EbayTradingReadError(result.Errors?.some(e => ["931", "932", "16110", "21917053"].includes(e.ErrorCode ?? "")));
  }
  const active = result.ActiveList;
  const total = active?.PaginationResult.TotalNumberOfEntries ?? 0;
  const pages = active?.PaginationResult.TotalNumberOfPages ?? 0;
  const items = active?.ItemArray && typeof active.ItemArray === "object" ? active.ItemArray.Item ?? [] : [];
  if ((total > 0 && page <= pages && !items.length) || (items.length > 0 && (total < items.length || pages < page))
    || new Set(items.map(i => i.ItemID)).size !== items.length) throw new EbayTradingReadError();
  return {
    page, total, nextPage: page < pages && page < 125 ? page + 1 : null,
    limited: total >= 25_000 || pages > 125, warning: result.Ack === "Warning",
    items: items.map(item => ({
      listingId: item.ItemID, title: item.Title, sku: item.SKU || undefined, listingType: item.ListingType,
      quantity: item.QuantityAvailable,
      price: item.SellingStatus?.CurrentPrice ? {
        value: item.SellingStatus.CurrentPrice["#text"], currency: item.SellingStatus.CurrentPrice["@_currencyID"]
      } : undefined
    }))
  };
}

export async function readEbayActiveListings(env: ApiEnv, accessToken: string, page: number) {
  if (!Number.isInteger(page) || page < 1 || page > 125) throw new EbayTradingReadError();
  const xml = await callEbayTradingRead(env, accessToken, "GetMyeBaySelling",
    '<ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>' + page + '</PageNumber></Pagination></ActiveList>' +
    '<SoldList><Include>false</Include></SoldList><UnsoldList><Include>false</Include></UnsoldList><ScheduledList><Include>false</Include></ScheduledList>');
  return parseActiveListings(xml, page);
}
