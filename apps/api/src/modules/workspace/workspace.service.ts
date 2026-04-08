import { calculateWorkspaceUsage, getWorkspacePlanDefinition, type WorkspacePlan } from "@omnilist/shared";

import type { AuthRepository } from "../auth/auth.repository";
import type { ProductRepository } from "../catalog/catalog.repository";

export function createWorkspaceService(authRepository: AuthRepository, productRepository: ProductRepository) {
  return {
    async getWorkspace(workspaceId: string) {
      return authRepository.getWorkspace(workspaceId);
    },
    async getWorkspaceUsage(workspaceId: string) {
      const workspace = await authRepository.getWorkspace(workspaceId);

      if (!workspace) {
        return undefined;
      }

      const productCount = await productRepository.countProducts(workspaceId);

      return calculateWorkspaceUsage(workspace.id, workspace.subscriptionPlan, productCount);
    },
    async updateWorkspacePlan(workspaceId: string, subscriptionPlan: WorkspacePlan) {
      return authRepository.updateWorkspacePlan(workspaceId, subscriptionPlan);
    },
    canCreateProduct(subscriptionPlan: WorkspacePlan, productCount: number) {
      const plan = getWorkspacePlanDefinition(subscriptionPlan);
      return plan.productLimit === null || productCount < plan.productLimit;
    }
  };
}
