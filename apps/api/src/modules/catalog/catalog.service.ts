import type { ProductUpsertInput } from "@omnilist/shared";

import type { MediaService } from "../media/media.service";
import { ProductWriteError, type ProductRepository } from "./catalog.repository";

export function createCatalogService(repository: ProductRepository, mediaService: MediaService) {
  return {
    listProducts(workspaceId: string) {
      return repository.listProducts(workspaceId);
    },
    countProducts(workspaceId: string) {
      return repository.countProducts(workspaceId);
    },
    getProductById(workspaceId: string, productId: string) {
      return repository.getProductById(workspaceId, productId);
    },
    async createProduct(workspaceId: string, input: ProductUpsertInput) {
      const productId = crypto.randomUUID();
      const preparedImages = await mediaService.prepareProductAssets(workspaceId, productId, input.images);

      return repository.createProduct(workspaceId, {
        ...input,
        images: preparedImages
      }, productId);
    },
    async updateProduct(workspaceId: string, productId: string, input: ProductUpsertInput, expectedRevision?: string) {
      const current = await repository.getProductById(workspaceId, productId);
      if (!current) return undefined;
      if (expectedRevision && current.revision !== expectedRevision) {
        throw new ProductWriteError("This product changed. Reload it before saving your changes.");
      }
      const preparedImages = await mediaService.prepareProductAssets(workspaceId, productId, input.images);

      return repository.updateProduct(workspaceId, productId, {
        ...input,
        images: preparedImages
      }, expectedRevision);
    },
    deleteProduct(workspaceId: string, productId: string) {
      return repository.deleteProduct(workspaceId, productId);
    }
  };
}
