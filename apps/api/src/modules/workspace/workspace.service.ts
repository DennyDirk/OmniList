import { calculateWorkspaceUsage, getWorkspacePlanDefinition, type WorkspacePlan } from "@omnilist/shared";

import type { ProductRepository } from "../catalog/catalog.repository";
import type { WorkspaceRepository } from "./workspace.repository";

export function createWorkspaceService(workspaceRepository: WorkspaceRepository, productRepository: ProductRepository) {
  return {
    async getWorkspace(workspaceId: string) {
      return workspaceRepository.getWorkspace(workspaceId);
    },
    async getWorkspaceUsage(workspaceId: string) {
      const workspace = await workspaceRepository.getWorkspace(workspaceId);

      if (!workspace) {
        return undefined;
      }

      const productCount = await productRepository.countProducts(workspaceId);

      return calculateWorkspaceUsage(workspace.id, workspace.subscriptionPlan, productCount);
    },
    async updateWorkspacePlan(workspaceId: string, subscriptionPlan: WorkspacePlan) {
      return workspaceRepository.updateWorkspacePlan(workspaceId, subscriptionPlan);
    },
    canCreateProduct(subscriptionPlan: WorkspacePlan, productCount: number) {
      const plan = getWorkspacePlanDefinition(subscriptionPlan);
      return plan.productLimit === null || productCount < plan.productLimit;
    }
  };
}
