import { ebayConditionIds, type EbayCategoryRequirements } from "@omnilist/shared";
import type { ApiEnv } from "../../../config/env";
import { callEbayInventoryApi, getEbayApplicationToken } from "./ebay-client";

export class EbayPreparationError extends Error {}

interface AspectResponse {
  localizedAspectName: string;
  aspectConstraint: {
    aspectRequired?: boolean;
    aspectMode?: string;
    itemToAspectCardinality?: string;
    aspectMaxLength?: number;
  };
  aspectValues?: Array<{
    localizedValue: string;
    valueConstraints?: Array<{ applicableForLocalizedAspectName: string; applicableForLocalizedAspectValues: string[] }>;
  }>;
}

export async function getEbayCategoryRequirements(
  env: ApiEnv, sellerToken: string, marketplaceId: string, categoryId: string
): Promise<EbayCategoryRequirements> {
  if (marketplaceId !== "EBAY_US") throw new EbayPreparationError("The first eBay publishing release supports EBAY_US only.");
  if (!/^\d{1,12}$/.test(categoryId)) throw new EbayPreparationError("Enter a numeric eBay leaf category ID.");
  const appToken = await getEbayApplicationToken(env);

  async function get<T>(path: string, token = appToken): Promise<T> {
    const response = await callEbayInventoryApi<T & { errors?: Array<{ longMessage?: string; message?: string }> }>(env, token, { path, method: "GET" });
    if (!response.ok || !response.data) {
      const detail = response.data?.errors?.[0];
      throw new EbayPreparationError(`Could not verify eBay category ${categoryId} (HTTP ${response.status}). ${detail?.longMessage || detail?.message || "Try checking the category again; publication was not started."}`);
    }
    return response.data;
  }

  const tree = await get<{ categoryTreeId: string }>("/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=EBAY_US");
  if (!/^\d+$/.test(tree.categoryTreeId)) throw new EbayPreparationError("eBay returned no usable category tree. Try again later.");
  const taxonomyPath = `/commerce/taxonomy/v1/category_tree/${tree.categoryTreeId}`;
  const node = await get<{ categorySubtreeNode: { category: { categoryId: string; categoryName: string }; leafCategoryTreeNode?: boolean } }>(
    `${taxonomyPath}/get_category_subtree?category_id=${categoryId}`
  );
  const category = node.categorySubtreeNode;
  if (!category?.leafCategoryTreeNode || category.category?.categoryId !== categoryId || !category.category.categoryName) {
    throw new EbayPreparationError("Choose a final (leaf) eBay category, not a parent category.");
  }
  const [aspectResponse, conditionResponse] = await Promise.all([
    get<{ aspects: AspectResponse[] }>(`${taxonomyPath}/get_item_aspects_for_category?category_id=${categoryId}`),
    get<{ itemConditionPolicies: Array<{
      categoryId: string;
      itemConditions: Array<{ conditionId: string; conditionDescription: string; conditionDescriptors?: unknown[] }>;
    }> }>(`/sell/metadata/v1/marketplace/${marketplaceId}/get_item_condition_policies?filter=${encodeURIComponent(`categoryIds:{${categoryId}}`)}`, sellerToken)
  ]);
  const policy = conditionResponse.itemConditionPolicies?.find(item => item.categoryId === categoryId);
  if (!Array.isArray(policy?.itemConditions) || !Array.isArray(aspectResponse.aspects)) {
    throw new EbayPreparationError("eBay did not return complete category requirements. No listing was sent; try again later.");
  }

  return {
    marketplaceId,
    categoryId,
    categoryName: category.category.categoryName,
    conditions: policy.itemConditions.map(item => ({
      value: Object.keys(ebayConditionIds).find(key => ebayConditionIds[key] === item.conditionId) ?? item.conditionId,
      label: item.conditionDescription,
      supported: Object.values(ebayConditionIds).includes(item.conditionId) && !item.conditionDescriptors?.length
    })),
    aspects: aspectResponse.aspects.map(item => ({
      name: item.localizedAspectName,
      required: item.aspectConstraint.aspectRequired === true,
      selectionOnly: item.aspectConstraint.aspectMode === "SELECTION_ONLY",
      multiple: item.aspectConstraint.itemToAspectCardinality === "MULTI",
      maxLength: item.aspectConstraint.aspectMaxLength ?? 50,
      values: (item.aspectValues ?? []).map(value => ({
        value: value.localizedValue,
        constraints: value.valueConstraints?.map(constraint => ({
          name: constraint.applicableForLocalizedAspectName,
          values: constraint.applicableForLocalizedAspectValues
        }))
      }))
    }))
  };
}
