import { and, desc, eq } from "drizzle-orm";
import { inventoryAdjustmentInputSchema, type InventoryAdjustmentInput, type InventoryMovement } from "@omnilist/shared";

import type { DbClient } from "../../db/client";
import { inventoryMovementsTable } from "../../db/schema";

export interface InventoryMovementRecordInput {
  workspaceId: string;
  productId: string;
  previousQuantity: number;
  nextQuantity: number;
  input: InventoryAdjustmentInput;
}

export interface InventoryRepository {
  listMovements(workspaceId: string, productId: string): Promise<InventoryMovement[]>;
  recordMovement(input: InventoryMovementRecordInput): Promise<InventoryMovement>;
}

function createMemoryInventoryRepository(): InventoryRepository {
  const itemsByWorkspace = new Map<string, InventoryMovement[]>();

  function getWorkspaceItems(workspaceId: string) {
    const existing = itemsByWorkspace.get(workspaceId);

    if (existing) {
      return existing;
    }

    const created: InventoryMovement[] = [];
    itemsByWorkspace.set(workspaceId, created);
    return created;
  }

  return {
    async listMovements(workspaceId, productId) {
      return getWorkspaceItems(workspaceId).filter((item) => item.productId === productId).slice(0, 20);
    },
    async recordMovement(input) {
      const parsed = inventoryAdjustmentInputSchema.parse(input.input);
      const movement: InventoryMovement = {
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        productId: input.productId,
        variantId: parsed.variantId,
        delta: parsed.delta,
        previousQuantity: input.previousQuantity,
        nextQuantity: input.nextQuantity,
        source: parsed.source,
        reason: parsed.reason,
        channelId: parsed.channelId,
        createdAt: new Date().toISOString()
      };

      getWorkspaceItems(input.workspaceId).unshift(movement);
      return movement;
    }
  };
}

function fromDbRow(row: typeof inventoryMovementsTable.$inferSelect): InventoryMovement {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    productId: row.productId,
    variantId: row.variantId ?? undefined,
    delta: row.delta,
    previousQuantity: row.previousQuantity,
    nextQuantity: row.nextQuantity,
    source: row.source as InventoryMovement["source"],
    reason: row.reason ?? undefined,
    channelId: row.channelId as InventoryMovement["channelId"] | undefined,
    createdAt: row.createdAt.toISOString()
  };
}

function createDbInventoryRepository(db: DbClient): InventoryRepository {
  return {
    async listMovements(workspaceId, productId) {
      const rows = await db
        .select()
        .from(inventoryMovementsTable)
        .where(and(eq(inventoryMovementsTable.workspaceId, workspaceId), eq(inventoryMovementsTable.productId, productId)))
        .orderBy(desc(inventoryMovementsTable.createdAt))
        .limit(20);

      return rows.map(fromDbRow);
    },
    async recordMovement(input) {
      const parsed = inventoryAdjustmentInputSchema.parse(input.input);
      const rows = await db
        .insert(inventoryMovementsTable)
        .values({
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          productId: input.productId,
          variantId: parsed.variantId,
          delta: parsed.delta,
          previousQuantity: input.previousQuantity,
          nextQuantity: input.nextQuantity,
          source: parsed.source,
          reason: parsed.reason,
          channelId: parsed.channelId
        })
        .returning();

      return fromDbRow(rows[0]);
    }
  };
}

export function createInventoryRepository(db?: DbClient): InventoryRepository {
  if (!db) {
    return createMemoryInventoryRepository();
  }

  return createDbInventoryRepository(db);
}
