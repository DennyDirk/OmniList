import { isDeepStrictEqual } from "node:util";
import type { ApiEnv } from "../../config/env";
import type { ChannelConnectionRecord, ChannelConnectionRepository } from "../channels/channel-connections.repository";
import { ensureValidEbayAccessToken } from "../channels/adapters/ebay-client";
import { readEbayActiveListings } from "../channels/adapters/ebay-active-listings";
import { EbayCatalogError } from "./ebay-catalog.service";
import { readEbayItemDetails, readEbayItemImportData } from "../channels/adapters/ebay-item-details";
import { ebayListingDetailsSchema, type EbayListingDetails } from "@omnilist/shared";
import type { ProductImportRepository } from "./product-import.repository";
import { mapEbayItemToProduct } from "./ebay-import.mapper";

interface ListingInput { listingId: unknown; page: unknown; connectionId: unknown; environment: unknown }

function parseListingInput(input: ListingInput) {
  const page = typeof input.page === "number" ? input.page
    : typeof input.page === "string" && /^[1-9]\d{0,2}$/.test(input.page) ? Number(input.page) : NaN;
  if (typeof input.listingId !== "string" || !/^\d{1,19}$/.test(input.listingId)
    || !Number.isInteger(page) || page < 1 || page > 125
    || typeof input.connectionId !== "string" || typeof input.environment !== "string") {
    throw new EbayCatalogError(400, "Invalid listing or catalog page.");
  }
  return { listingId: input.listingId, page, connectionId: input.connectionId, environment: input.environment };
}

function getLimitations(item: Awaited<ReturnType<typeof readEbayItemDetails>>, pageWarning: boolean): EbayListingDetails["limitations"] {
  const limitations: EbayListingDetails["limitations"] = [];
  if (item.hasVariations) limitations.push("variations");
  if (item.listingType !== "FixedPriceItem") limitations.push("listing_type");
  if (item.site !== "US" || (item.price && item.price.currency !== "USD")) limitations.push("market");
  if (item.listingStatus !== "Active") limitations.push("inactive");
  if (!item.sku?.trim() || item.sku.trim().length > 128) limitations.push("missing_sku");
  if (!item.hasDescription) limitations.push("missing_description");
  if (!item.price) limitations.push("missing_price");
  if (item.quantity === undefined) limitations.push("missing_quantity");
  if (item.warning || pageWarning) limitations.push("upstream_warning");
  return limitations;
}

export function createEbayActiveCatalogService(connections: ChannelConnectionRepository, env: ApiEnv, imports?: ProductImportRepository) {
  async function readOwnedItem<T>(workspaceId: string, rawInput: ListingInput,
    reader: (env: ApiEnv, token: string, listingId: string) => Promise<T>): Promise<{ item: T; record: ChannelConnectionRecord; pageWarning: boolean }> {
    const input = parseListingInput(rawInput);
    const found = await connections.getConnectionRecord(workspaceId, "ebay");
    if (!found || found.connection.status !== "connected" || found.connection.workspaceId !== workspaceId
      || found.connection.channelId !== "ebay") throw new EbayCatalogError(409, "Connect eBay to view listing details.");
    const record = structuredClone(found);
    if (input.connectionId !== record.connection.id || input.environment !== env.ebayEnvironment) {
      throw new EbayCatalogError(409, "The eBay connection changed. Reload the catalog.");
    }
    let auth;
    try { auth = await ensureValidEbayAccessToken(env, record.credentials); }
    catch { throw new EbayCatalogError(409, "Could not authorize eBay. Check the connection."); }
    const page = await readEbayActiveListings(env, auth.accessToken, input.page);
    if (!page.items.some(item => item.listingId === input.listingId)) {
      throw new EbayCatalogError(409, "The listing is no longer on this account's catalog page. Reload the catalog.");
    }
    const item = await reader(env, auth.accessToken, input.listingId);
    const current = await connections.getConnectionRecordById(workspaceId, record.connection.id);
    if (!current || !isDeepStrictEqual(current.connection, record.connection)
      || !isDeepStrictEqual(current.credentials, record.credentials)) {
      throw new EbayCatalogError(409, "The eBay connection changed. Reload the catalog.");
    }
    await connections.setCredentialsForConnection(workspaceId, record.connection.id, record.credentials, auth.credentials);
    const stable = await connections.getConnectionRecordById(workspaceId, record.connection.id);
    if (!stable || !isDeepStrictEqual(stable.connection, record.connection)
      || !isDeepStrictEqual(stable.credentials, auth.credentials)) {
      throw new EbayCatalogError(409, "The eBay connection changed. Reload the catalog.");
    }
    return { item, record: stable, pageWarning: page.warning };
  }

  return {
    async details(workspaceId: string, input: ListingInput): Promise<EbayListingDetails> {
      const { item, record, pageWarning } = await readOwnedItem(workspaceId, input, readEbayItemDetails);
      const limitations = getLimitations(item, pageWarning);
      return ebayListingDetailsSchema.parse({ ...item,
        source: { channelId: "ebay", api: "trading", connectionId: record.connection.id, environment: env.ebayEnvironment,
          listingId: item.listingId, sellerId: item.sellerId }, checkedAt: new Date().toISOString(), limitations,
        importAvailable: limitations.length === 0 });
    },
    async importListing(workspaceId: string, input: ListingInput) {
      if (!imports) throw new EbayCatalogError(503, "Product import requires persistent storage.");
      const { item, record, pageWarning } = await readOwnedItem(workspaceId, input, readEbayItemImportData);
      if (item.warning || pageWarning) throw new EbayCatalogError(422, "eBay returned a warning. Recheck the listing before importing.");
      const product = mapEbayItemToProduct(item);
      return imports.importProduct(workspaceId, {
        product, connection: record,
        source: { channelId: "ebay", api: "trading", connectionId: record.connection.id,
          environment: env.ebayEnvironment, listingId: item.listingId, sellerId: item.sellerId,
          currency: "USD", importedAt: new Date().toISOString() }
      });
    },
    async list(workspaceId: string, page: unknown = "1") {
      if (typeof page !== "string" || !/^[1-9]\d{0,2}$/.test(page) || Number(page) > 125) {
        throw new EbayCatalogError(400, "Page must be between 1 and 125.");
      }
      const found = await connections.getConnectionRecord(workspaceId, "ebay");
      if (!found || found.connection.status !== "connected" || found.connection.workspaceId !== workspaceId
        || found.connection.channelId !== "ebay") throw new EbayCatalogError(409, "Connect eBay to view active listings.");
      const record = structuredClone(found);
      let auth;
      try { auth = await ensureValidEbayAccessToken(env, record.credentials); }
      catch { throw new EbayCatalogError(409, "Could not authorize eBay. Check the connection."); }
      const result = await readEbayActiveListings(env, auth.accessToken, Number(page));
      const current = await connections.getConnectionRecordById(workspaceId, record.connection.id);
      if (!current || JSON.stringify(current.connection) !== JSON.stringify(record.connection)
        || current.credentials.refreshToken !== record.credentials.refreshToken) {
        throw new EbayCatalogError(409, "The eBay connection changed. Reload the catalog.");
      }
      await connections.setCredentialsForConnection(workspaceId, record.connection.id, record.credentials, auth.credentials);
      const links = imports ? await imports.findEbayListingLinks(workspaceId, record.connection.id, env.ebayEnvironment,
        result.items.map(item => item.listingId)) : [];
      const linksByListingId = new Map(links.map(link => [link.listingId, link]));
      return { connectionId: record.connection.id, environment: env.ebayEnvironment, ...result,
        items: result.items.map(item => {
          const link = linksByListingId.get(item.listingId);
          return link ? { ...item, localLink: { kind: link.kind, productId: link.productId, productTitle: link.productTitle } } : item;
        }) };
    }
  };
}
