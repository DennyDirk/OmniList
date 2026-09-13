import type { EbayCatalogPage } from "@omnilist/shared";
import { z } from "zod";
import type { ApiEnv } from "../../config/env";
import type { ChannelConnectionRepository } from "../channels/channel-connections.repository";
import { callEbayInventoryApi, ensureValidEbayAccessToken } from "../channels/adapters/ebay-client";

const pageSize = 20;
const inventoryPageSchema = z.object({
  total: z.number().int().nonnegative(),
  inventoryItems: z.array(z.object({
    sku: z.string().min(1),
    product: z.object({ title: z.string().optional() }).optional(),
    condition: z.string().optional()
  })).max(pageSize).optional()
});

export class EbayCatalogError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function createEbayCatalogService(connections: ChannelConnectionRepository, env: ApiEnv) {
  return {
    async list(workspaceId: string, offset: number): Promise<EbayCatalogPage> {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000 || offset % pageSize !== 0) {
        throw new EbayCatalogError(400, "Invalid catalog page.");
      }
      const record = await connections.getConnectionRecord(workspaceId, "ebay");
      if (!record || record.connection.status !== "connected") {
        throw new EbayCatalogError(409, "Connect eBay before viewing its catalog.");
      }
      if (record.connection.workspaceId !== workspaceId || record.connection.channelId !== "ebay") {
        throw new EbayCatalogError(409, "The eBay connection is unavailable.");
      }
      let auth;
      try {
        auth = await ensureValidEbayAccessToken(env, record.credentials);
      } catch {
        throw new EbayCatalogError(409, "Could not authorize eBay. Check the connection and try again.");
      }
      let response;
      try {
        response = await callEbayInventoryApi<unknown>(env, auth.accessToken, {
          path: `/sell/inventory/v1/inventory_item?limit=${pageSize}&offset=${offset}`,
          method: "GET"
        });
      } catch {
        throw new EbayCatalogError(502, "eBay is unavailable. Try loading the catalog again.");
      }
      if (!response.ok) {
        throw new EbayCatalogError(response.status === 401 || response.status === 403 ? 409 : 502,
          response.status === 401 || response.status === 403
            ? "Reconnect eBay to grant access to inventory."
            : "eBay could not load the catalog. Try again later.");
      }
      const parsed = inventoryPageSchema.safeParse(response.data);
      if (!parsed.success || (parsed.data.total > offset && !parsed.data.inventoryItems?.length)
        || (parsed.success && parsed.data.total > offset + (parsed.data.inventoryItems?.length ?? 0)
          && (parsed.data.inventoryItems?.length ?? 0) < pageSize)) {
        throw new EbayCatalogError(502, "eBay returned an incomplete catalog response. Try again.");
      }
      // Do not expose a result fetched for an account disconnected/replaced during the request.
      const current = await connections.getConnectionRecord(workspaceId, "ebay");
      if (!current || current.connection.status !== "connected" || current.connection.id !== record.connection.id
        || current.connection.externalAccountId !== record.connection.externalAccountId
        || current.credentials.refreshToken !== record.credentials.refreshToken) {
        throw new EbayCatalogError(409, "The eBay connection changed. Reload the catalog.");
      }
      await connections.setCredentialsForConnection(workspaceId, record.connection.id, record.credentials, auth.credentials);
      const items = parsed.data.inventoryItems ?? [];
      return {
        connectionId: record.connection.id,
        environment: env.ebayEnvironment,
        offset,
        nextOffset: items.length === pageSize && offset + pageSize < parsed.data.total ? offset + pageSize : null,
        total: parsed.data.total,
        items: items.map(item => ({ sku: item.sku, title: item.product?.title?.trim() || item.sku, condition: item.condition }))
      };
    }
  };
}
