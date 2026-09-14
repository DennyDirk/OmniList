import type { ApiEnv } from "../../config/env";
import type { ChannelConnectionRepository } from "../channels/channel-connections.repository";
import { ensureValidEbayAccessToken } from "../channels/adapters/ebay-client";
import { readEbayActiveListings } from "../channels/adapters/ebay-active-listings";
import { EbayCatalogError } from "./ebay-catalog.service";
import { readEbayItemDetails } from "../channels/adapters/ebay-item-details";
import { ebayListingDetailsSchema, type EbayListingDetails } from "@omnilist/shared";

export function createEbayActiveCatalogService(connections: ChannelConnectionRepository, env: ApiEnv) {
  return {
    async details(workspaceId: string, input: { listingId: unknown; page: unknown; connectionId: unknown; environment: unknown }): Promise<EbayListingDetails> {
      if (typeof input.listingId !== "string" || !/^\d{1,19}$/.test(input.listingId)
        || typeof input.page !== "string" || !/^[1-9]\d{0,2}$/.test(input.page) || Number(input.page) > 125) {
        throw new EbayCatalogError(400, "Invalid listing or catalog page.");
      }
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
      // GetItem can return public listings: validate ownership through the token's own active list first.
      const page = await readEbayActiveListings(env, auth.accessToken, Number(input.page));
      if (!page.items.some(item => item.listingId === input.listingId)) {
        throw new EbayCatalogError(409, "The listing is no longer on this account's catalog page. Reload the catalog.");
      }
      const item = await readEbayItemDetails(env, auth.accessToken, input.listingId);
      const current = await connections.getConnectionRecordById(workspaceId, record.connection.id);
      if (!current || JSON.stringify(current.connection) !== JSON.stringify(record.connection)
        || current.credentials.refreshToken !== record.credentials.refreshToken) {
        throw new EbayCatalogError(409, "The eBay connection changed. Reload the catalog.");
      }
      await connections.setCredentialsForConnection(workspaceId, record.connection.id, record.credentials, auth.credentials);
      const limitations: EbayListingDetails["limitations"] = [];
      if (item.hasVariations) limitations.push("variations");
      if (item.listingType !== "FixedPriceItem") limitations.push("listing_type");
      if (item.site !== "US" || (item.price && item.price.currency !== "USD")) limitations.push("market");
      if (item.listingStatus !== "Active") limitations.push("inactive");
      if (!item.price) limitations.push("missing_price");
      if (item.quantity === undefined) limitations.push("missing_quantity");
      if (item.warning || page.warning) limitations.push("upstream_warning");
      return ebayListingDetailsSchema.parse({ ...item,
        source: { channelId: "ebay", api: "trading", connectionId: record.connection.id, environment: env.ebayEnvironment,
          listingId: item.listingId, sellerId: item.sellerId }, checkedAt: new Date().toISOString(), limitations, importAvailable: false });
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
      return { connectionId: record.connection.id, environment: env.ebayEnvironment, ...result };
    }
  };
}
