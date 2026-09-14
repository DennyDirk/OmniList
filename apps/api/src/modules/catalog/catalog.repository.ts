import { and, desc, eq, count } from "drizzle-orm";
import { productUpsertInputSchema, productSourceSchema, workspacePlans, type Product, type ProductUpsertInput } from "@omnilist/shared";

import type { DbClient } from "../../db/client";
import { productsTable, workspacesTable } from "../../db/schema";

export class ProductWriteError extends Error { readonly statusCode = 409; }

export async function lockProductCreation(db: Pick<DbClient, "select">, workspaceId: string) {
  const [workspace] = await db.select().from(workspacesTable).where(eq(workspacesTable.id, workspaceId)).for("update");
  if (!workspace) throw new ProductWriteError("Workspace not found.");
  return workspace.subscriptionPlan === "pro" ? workspacePlans.pro.productLimit : workspacePlans.free.productLimit;
}

export async function checkProductLimit(db: Pick<DbClient, "select">, workspaceId: string, limit: number | null) {
  if (limit === null) return;
  const [usage] = await db.select({ count: count() }).from(productsTable).where(eq(productsTable.workspaceId, workspaceId));
  if (usage.count >= limit) throw new ProductWriteError("Product limit reached. Upgrade your plan before importing or creating more products.");
}

export interface ProductRepository {
  listProducts(workspaceId: string): Promise<Product[]>;
  countProducts(workspaceId: string): Promise<number>;
  getProductById(workspaceId: string, productId: string): Promise<Product | undefined>;
  createProduct(workspaceId: string, input: ProductUpsertInput, productId?: string): Promise<Product>;
  updateProduct(workspaceId: string, productId: string, input: ProductUpsertInput): Promise<Product | undefined>;
  deleteProduct(workspaceId: string, productId: string): Promise<boolean>;
}

function toStoredProduct(input: ProductUpsertInput, productId: string): Product {
  return {
    id: productId,
    ...productUpsertInputSchema.parse(input)
  };
}

function getWorkspaceItems(
  store: Map<string, Map<string, Product>>,
  workspaceId: string
) {
  const existing = store.get(workspaceId);

  if (existing) {
    return existing;
  }

  const created = new Map<string, Product>();
  store.set(workspaceId, created);
  return created;
}

function createMemoryProductRepository(): ProductRepository {
  const itemsByWorkspace = new Map<string, Map<string, Product>>();

  return {
    async listProducts(workspaceId) {
      return [...getWorkspaceItems(itemsByWorkspace, workspaceId).values()];
    },
    async countProducts(workspaceId) {
      return getWorkspaceItems(itemsByWorkspace, workspaceId).size;
    },
    async getProductById(workspaceId, productId) {
      return getWorkspaceItems(itemsByWorkspace, workspaceId).get(productId);
    },
    async createProduct(workspaceId, input, productId = crypto.randomUUID()) {
      const product = toStoredProduct(input, productId);
      getWorkspaceItems(itemsByWorkspace, workspaceId).set(product.id, product);
      return product;
    },
    async updateProduct(workspaceId, productId, input) {
      const items = getWorkspaceItems(itemsByWorkspace, workspaceId);

      if (!items.has(productId)) {
        return undefined;
      }
      const product = toStoredProduct(input, productId);
      if (product.currency !== items.get(productId)!.currency) throw new ProductWriteError("Changing the product currency is not supported.");
      product.source = items.get(productId)!.source;
      items.set(product.id, product);
      return product;
    },
    async deleteProduct(workspaceId, productId) {
      return getWorkspaceItems(itemsByWorkspace, workspaceId).delete(productId);
    }
  };
}

export function fromDbRow(row: typeof productsTable.$inferSelect): Product {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    brand: row.brand ?? undefined,
    sku: row.sku,
    basePrice: Number(row.basePrice),
    currency: row.currency,
    source: row.source ? productSourceSchema.parse(row.source) : undefined,
    quantity: Number(row.quantity),
    categoryId: row.categoryId ?? undefined,
    categoryLabel: row.categoryLabel ?? undefined,
    images: row.images,
    attributes: row.attributes,
    variants: row.variants,
    channelOverrides: row.channelOverrides
  };
}

function createDbProductRepository(db: DbClient): ProductRepository {
  return {
    async listProducts(workspaceId) {
      const rows = await db
        .select()
        .from(productsTable)
        .where(eq(productsTable.workspaceId, workspaceId))
        .orderBy(desc(productsTable.createdAt));
      return rows.map(fromDbRow);
    },
    async countProducts(workspaceId) {
      const rows = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.workspaceId, workspaceId));
      return rows.length;
    },
    async getProductById(workspaceId, productId) {
      const rows = await db
        .select()
        .from(productsTable)
        .where(and(eq(productsTable.workspaceId, workspaceId), eq(productsTable.id, productId)))
        .limit(1);

      return rows[0] ? fromDbRow(rows[0]) : undefined;
    },
    async createProduct(workspaceId, input, productId = crypto.randomUUID()) {
      const parsed = productUpsertInputSchema.parse(input);
      await db.transaction(async tx => {
        const limit = await lockProductCreation(tx, workspaceId);
        await checkProductLimit(tx, workspaceId, limit);
        await tx.insert(productsTable).values({
        id: productId,
        workspaceId,
        title: parsed.title,
        description: parsed.description,
        brand: parsed.brand,
        sku: parsed.sku,
        basePrice: String(parsed.basePrice),
        currency: parsed.currency,
        quantity: parsed.quantity,
        categoryId: parsed.categoryId,
        categoryLabel: parsed.categoryLabel,
        images: parsed.images,
        attributes: parsed.attributes,
        variants: parsed.variants,
        channelOverrides: parsed.channelOverrides
        });
      });

      return {
        id: productId,
        ...parsed
      };
    },
    async updateProduct(workspaceId, productId, input) {
      const parsed = productUpsertInputSchema.parse(input);
      const [existing] = await db.select().from(productsTable).where(and(eq(productsTable.workspaceId, workspaceId), eq(productsTable.id, productId))).limit(1);
      if (existing && existing.currency !== parsed.currency) throw new ProductWriteError("Changing the product currency is not supported.");

      const result = await db
        .update(productsTable)
        .set({
          title: parsed.title,
          description: parsed.description,
          brand: parsed.brand,
          sku: parsed.sku,
          basePrice: String(parsed.basePrice),
          currency: parsed.currency,
          quantity: parsed.quantity,
          categoryId: parsed.categoryId,
          categoryLabel: parsed.categoryLabel,
          images: parsed.images,
          attributes: parsed.attributes,
          variants: parsed.variants,
          channelOverrides: parsed.channelOverrides,
          updatedAt: new Date()
        })
        .where(and(eq(productsTable.workspaceId, workspaceId), eq(productsTable.id, productId)))
        .returning();

      return result[0] ? fromDbRow(result[0]) : undefined;
    },
    async deleteProduct(workspaceId, productId) {
      const result = await db
        .delete(productsTable)
        .where(and(eq(productsTable.workspaceId, workspaceId), eq(productsTable.id, productId)))
        .returning({ id: productsTable.id });

      return result.length > 0;
    }
  };
}

export function createProductRepository(db?: DbClient): ProductRepository {
  if (!db) {
    return createMemoryProductRepository();
  }

  return createDbProductRepository(db);
}
