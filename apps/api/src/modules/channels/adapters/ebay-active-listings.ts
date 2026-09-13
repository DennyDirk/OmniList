import { XMLParser, XMLValidator } from "fast-xml-parser";
import { z } from "zod";
import type { ApiEnv } from "../../../config/env";
import { getEbayBaseUrls } from "./ebay-client";

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

export class EbayTradingReadError extends Error {
  constructor(public readonly reconnect: boolean = false) {
    super(reconnect ? "Reconnect eBay to read active listings." : "Could not read active eBay listings. Try again.");
  }
}

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
  try {
    const response = await fetch(`${getEbayBaseUrls(env.ebayEnvironment).apiBaseUrl}/ws/api.dll`, {
      method: "POST", signal: AbortSignal.timeout(15_000), redirect: "error",
      headers: {
        "Content-Type": "text/xml; charset=utf-8", "X-EBAY-API-CALL-NAME": "GetMyeBaySelling",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1477", "X-EBAY-API-SITEID": "0",
        "X-EBAY-API-IAF-TOKEN": accessToken
      },
      body: `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList><Include>true</Include><Pagination><EntriesPerPage>200</EntriesPerPage><PageNumber>${page}</PageNumber></Pagination></ActiveList>
  <SoldList><Include>false</Include></SoldList><UnsoldList><Include>false</Include></UnsoldList>
  <ScheduledList><Include>false</Include></ScheduledList>
</GetMyeBaySellingRequest>`
    });
    if (!response.ok) throw new EbayTradingReadError(response.status === 401 || response.status === 403);
    const reader = response.body?.getReader();
    if (!reader) throw new EbayTradingReadError();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) throw new EbayTradingReadError();
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return parseActiveListings(Buffer.concat(chunks).toString("utf8"), page);
  } catch (error) {
    throw error instanceof EbayTradingReadError ? error : new EbayTradingReadError();
  }
}
