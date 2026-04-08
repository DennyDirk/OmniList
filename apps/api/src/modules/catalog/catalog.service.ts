import type { ProductUpsertInput } from "@omnilist/shared";

import type { MediaService } from "../media/media.service";
import type { ProductRepository } from "./catalog.repository";

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
    async updateProduct(workspaceId: string, productId: string, input: ProductUpsertInput) {
      const preparedImages = await mediaService.prepareProductAssets(workspaceId, productId, input.images);

      return repository.updateProduct(workspaceId, productId, {
        ...input,
        images: preparedImages
      });
    },
    deleteProduct(workspaceId: string, productId: string) {
      return repository.deleteProduct(workspaceId, productId);
    }
  };
}
