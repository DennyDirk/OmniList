import {
  inventoryAdjustmentInputSchema,
  productInventorySnapshotSchema,
  type InventoryAdjustmentInput,
  type Product,
  type ProductInventorySnapshot
} from "@omnilist/shared";

import type { ProductRepository } from "../catalog/catalog.repository";
import type { InventoryRepository } from "./inventory.repository";

function toProductUpsertInput(product: Product) {
  return {
    title: product.title,
    description: product.description,
    brand: product.brand,
    sku: product.sku,
    basePrice: product.basePrice,
    quantity: product.quantity,
    categoryId: product.categoryId,
    categoryLabel: product.categoryLabel,
    images: product.images,
    attributes: product.attributes,
    variants: product.variants,
    channelOverrides: product.channelOverrides
  };
}

export function createInventoryService(productRepository: ProductRepository, inventoryRepository: InventoryRepository) {
  return {
    async getSnapshot(workspaceId: string, productId: string): Promise<ProductInventorySnapshot | undefined> {
      const product = await productRepository.getProductById(workspaceId, productId);

      if (!product) {
        return undefined;
      }

      const recentMovements = await inventoryRepository.listMovements(workspaceId, productId);
      return productInventorySnapshotSchema.parse({
        productId,
        totalQuantity: product.quantity,
        variantQuantities: product.variants.map((variant) => ({
          variantId: variant.id,
          sku: variant.sku,
          quantity: variant.quantity
        })),
        recentMovements
      });
    },
    async adjustInventory(workspaceId: string, productId: string, input: InventoryAdjustmentInput) {
      const parsed = inventoryAdjustmentInputSchema.parse(input);
      const product = await productRepository.getProductById(workspaceId, productId);

      if (!product) {
        return { kind: "not_found" as const };
      }

      if (parsed.variantId) {
        const variant = product.variants.find((item) => item.id === parsed.variantId);

        if (!variant) {
          return { kind: "variant_not_found" as const };
        }

        const nextQuantity = variant.quantity + parsed.delta;

        if (nextQuantity < 0) {
          return { kind: "insufficient_stock" as const };
        }

        const nextProduct: Product = {
          ...product,
          variants: product.variants.map((item) =>
            item.id === parsed.variantId
              ? {
                  ...item,
                  quantity: nextQuantity
                }
              : item
          ),
          quantity: product.variants
            .map((item) => (item.id === parsed.variantId ? nextQuantity : item.quantity))
            .reduce((sum, quantity) => sum + quantity, 0)
        };

        const updatedProduct = await productRepository.updateProduct(workspaceId, productId, toProductUpsertInput(nextProduct));

        if (!updatedProduct) {
          return { kind: "not_found" as const };
        }

        const movement = await inventoryRepository.recordMovement({
          workspaceId,
          productId,
          previousQuantity: variant.quantity,
          nextQuantity,
          input: parsed
        });

        return {
          kind: "ok" as const,
          product: updatedProduct,
          movement
        };
      }

      if (product.variants.length > 0) {
        return { kind: "variant_required" as const };
      }

      const nextQuantity = product.quantity + parsed.delta;

      if (nextQuantity < 0) {
        return { kind: "insufficient_stock" as const };
      }

      const nextProduct: Product = {
        ...product,
        quantity: nextQuantity,
        variants: product.variants
      };

      const updatedProduct = await productRepository.updateProduct(workspaceId, productId, toProductUpsertInput(nextProduct));

      if (!updatedProduct) {
        return { kind: "not_found" as const };
      }

      const movement = await inventoryRepository.recordMovement({
        workspaceId,
        productId,
        previousQuantity: product.quantity,
        nextQuantity,
        input: parsed
      });

      return {
        kind: "ok" as const,
        product: updatedProduct,
        movement
      };
    }
  };
}
