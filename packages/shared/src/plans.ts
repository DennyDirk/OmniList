import type { WorkspacePlan } from "./types";

export interface WorkspacePlanDefinition {
  id: WorkspacePlan;
  name: string;
  monthlyPriceUsd: number;
  productLimit: number | null;
  aiIncluded: boolean;
}

export interface WorkspaceUsage {
  workspaceId: string;
  subscriptionPlan: WorkspacePlan;
  productCount: number;
  productLimit: number | null;
  productsRemaining: number | null;
  aiIncluded: boolean;
}

export const workspacePlans: Record<WorkspacePlan, WorkspacePlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPriceUsd: 0,
    productLimit: 10,
    aiIncluded: false
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPriceUsd: 29,
    productLimit: null,
    aiIncluded: true
  }
};

export function getWorkspacePlanDefinition(plan: WorkspacePlan) {
  return workspacePlans[plan];
}

export function calculateWorkspaceUsage(workspaceId: string, subscriptionPlan: WorkspacePlan, productCount: number): WorkspaceUsage {
  const plan = getWorkspacePlanDefinition(subscriptionPlan);

  return {
    workspaceId,
    subscriptionPlan,
    productCount,
    productLimit: plan.productLimit,
    productsRemaining: plan.productLimit === null ? null : Math.max(plan.productLimit - productCount, 0),
    aiIncluded: plan.aiIncluded
  };
}
