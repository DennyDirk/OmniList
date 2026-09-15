import { isDeepStrictEqual } from "node:util";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { productSourceSchema, productUpsertInputSchema, type Product, type ProductSource, type ProductUpsertInput } from "@omnilist/shared";
import type { DbClient } from "../../db/client";
import { productsTable, channelConnectionsTable, channelListingsTable } from "../../db/schema";
import type { ChannelConnectionRecord } from "../channels/channel-connections.repository";
import { checkProductLimit, fromDbRow, lockProductCreation, ProductWriteError } from "./catalog.repository";

export interface ProductImportInput {
  product: ProductUpsertInput;
  source: ProductSource;
  connection: ChannelConnectionRecord;
}
export interface ProductImportResult { product: Product; outcome: "imported" | "existing" | "managed" }
export interface EbayListingLocalLink { listingId: string; kind: "imported" | "managed"; productId: string; productTitle: string }
export interface ProductImportRepository {
  importProduct(workspaceId: string, input: ProductImportInput): Promise<ProductImportResult>;
  findEbayListingLinks(workspaceId: string, connectionId: string, environment: string, listingIds: string[]): Promise<EbayListingLocalLink[]>;
}

// Internal persistence boundary, not an HTTP payload: source and product must come from verified server reads.
export function createProductImportRepository(db: DbClient): ProductImportRepository {
  return {
    async findEbayListingLinks(workspaceId, connectionId, environment, listingIds) {
      if (!listingIds.length) return [];
      const imported = await db.select({ id: productsTable.id, title: productsTable.title, source: productsTable.source })
        .from(productsTable).where(and(eq(productsTable.workspaceId, workspaceId),
          sql`${productsTable.source}->>'channelId' = 'ebay'`,
          sql`${productsTable.source}->>'connectionId' = ${connectionId}`,
          sql`${productsTable.source}->>'environment' = ${environment}`,
          inArray(sql<string>`${productsTable.source}->>'listingId'`, listingIds)));
      const managed = await db.select({ listingId: sql<string>`${channelListingsTable.remoteListing}->>'listingId'`,
        productId: productsTable.id, productTitle: productsTable.title })
        .from(channelListingsTable).innerJoin(productsTable, and(eq(productsTable.workspaceId, workspaceId),
          eq(productsTable.id, channelListingsTable.productId)))
        .where(and(eq(channelListingsTable.workspaceId, workspaceId), eq(channelListingsTable.connectionId, connectionId),
          eq(channelListingsTable.channelId, "ebay"), eq(channelListingsTable.environment, environment),
          inArray(sql<string>`${channelListingsTable.remoteListing}->>'listingId'`, listingIds)));
      const links = new Map<string, EbayListingLocalLink>();
      for (const row of imported) {
        const source = row.source && productSourceSchema.safeParse(row.source);
        if (source?.success && source.data.channelId === "ebay") links.set(source.data.listingId, {
          listingId: source.data.listingId, kind: "imported", productId: row.id, productTitle: row.title
        });
      }
      // A managed listing is the stronger relationship if historical data contains both links.
      for (const row of managed) if (row.listingId) links.set(row.listingId, {
        listingId: row.listingId, kind: "managed", productId: row.productId, productTitle: row.productTitle
      });
      return [...links.values()];
    },
    async importProduct(workspaceId: string, input: ProductImportInput): Promise<ProductImportResult> {
      const source = productSourceSchema.parse(input.source);
      const product = productUpsertInputSchema.parse(input.product);
      const expected = input.connection;
      if (product.currency !== source.currency || product.variants.length || expected.connection.workspaceId !== workspaceId
        || expected.connection.channelId !== "ebay" || expected.connection.id !== source.connectionId
        || expected.connection.status !== "connected" || expected.credentials.environment !== source.environment) {
        throw new ProductWriteError("The import does not match the verified account, currency or supported product type.");
      }
      return db.transaction(async tx => {
        // Native creation uses the same lock, so the last free slot cannot be consumed twice.
        const limit = await lockProductCreation(tx, workspaceId);
        const [connection] = await tx.select().from(channelConnectionsTable).where(and(
          eq(channelConnectionsTable.workspaceId, workspaceId), eq(channelConnectionsTable.id, source.connectionId))).for("update");
        if (!connection || connection.status !== "connected" || connection.channelId !== "ebay"
          || connection.externalAccountId !== (expected.connection.externalAccountId ?? null)
          || !isDeepStrictEqual(connection.metadata, expected.connection.metadata)
          || connection.credentials.refreshToken !== expected.credentials.refreshToken
          || connection.credentials.environment !== source.environment) {
          throw new ProductWriteError("The eBay connection changed. Reload the catalog before importing.");
        }
        const [existing] = await tx.select().from(productsTable).where(and(eq(productsTable.workspaceId, workspaceId),
          sql`${productsTable.source}->>'channelId' = 'ebay'`, sql`${productsTable.source}->>'environment' = ${source.environment}`,
          sql`${productsTable.source}->>'listingId' = ${source.listingId}`)).limit(1);
        if (existing) return { product: fromDbRow(existing), outcome: "existing" as const };

        const managed = await tx.select().from(channelListingsTable).where(and(eq(channelListingsTable.workspaceId, workspaceId),
          eq(channelListingsTable.channelId, "ebay"), eq(channelListingsTable.environment, source.environment),
          sql`${channelListingsTable.remoteListing}->>'listingId' = ${source.listingId}`)).limit(2);
        if (managed.length > 1) throw new ProductWriteError("This listing has ambiguous local links. Review them before importing.");
        if (managed[0]) {
          const [row] = await tx.select().from(productsTable).where(and(eq(productsTable.workspaceId, workspaceId), eq(productsTable.id, managed[0].productId))).limit(1);
          if (!row) throw new ProductWriteError("The existing listing's product is unavailable.");
          return { product: fromDbRow(row), outcome: "managed" as const };
        }
        const [uncertain] = await tx.select().from(channelListingsTable).where(and(eq(channelListingsTable.workspaceId, workspaceId),
          eq(channelListingsTable.connectionId, source.connectionId), eq(channelListingsTable.environment, source.environment),
          or(inArray(channelListingsTable.status, ["publishing", "needs_review"]), eq(channelListingsTable.sku, product.sku)))).limit(1);
        if (uncertain) throw new ProductWriteError("Resolve the existing publication or SKU link before importing. No products were merged.");
        await checkProductLimit(tx, workspaceId, limit);
        const [row] = await tx.insert(productsTable).values({ ...product, id: crypto.randomUUID(), workspaceId,
          basePrice: String(product.basePrice), source }).returning();
        return { product: fromDbRow(row), outcome: "imported" as const };
      });
    }
  };
}
