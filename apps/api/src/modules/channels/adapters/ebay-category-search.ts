import type { ApiEnv } from "../../../config/env";
import { callEbayInventoryApi, getEbayApplicationToken } from "./ebay-client";
import { EbayPreparationError } from "./ebay-category";

interface CategoryNode {
  category: { categoryId: string; categoryName: string };
  leafCategoryTreeNode?: boolean;
  childCategoryTreeNodes?: CategoryNode[];
}

export interface EbayCategoryChoice {
  id: string;
  name: string;
  path: string;
}

export function flattenEbayCategories(root: CategoryNode): EbayCategoryChoice[] {
  function visit(node: CategoryNode, ancestors: string[]): EbayCategoryChoice[] {
    if (!node.category?.categoryName || !/^\d+$/.test(node.category.categoryId)) {
      throw new EbayPreparationError("eBay returned an invalid category tree. Try again later.");
    }
    const names = [...ancestors, node.category.categoryName];
    if (node.leafCategoryTreeNode) return [{ id: node.category.categoryId, name: node.category.categoryName, path: names.join(" > ") }];
    return (node.childCategoryTreeNodes ?? []).flatMap(child => visit(child, names));
  }
  return (root.childCategoryTreeNodes ?? []).flatMap(node => visit(node, []));
}

function words(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function matchEbayCategories(categories: EbayCategoryChoice[], query: string): EbayCategoryChoice[] {
  const terms = words(query).split(" ").filter(Boolean);
  if (!terms.length) return [];
  return categories.filter(item => terms.every(term => words(item.path).includes(term)))
    .sort((a, b) => {
      const rank = (item: EbayCategoryChoice) => terms.filter(term => words(item.name).includes(term)).length;
      return rank(b) - rank(a) || a.path.localeCompare(b.path);
    }).slice(0, 30);
}

// Only public taxonomy is cached. A shared promise prevents concurrent tree downloads.
const cache = new Map<string, { expires: number; categories: Promise<EbayCategoryChoice[]> }>();

export async function searchEbayCategories(env: ApiEnv, marketplaceId: string, query: string) {
  if (marketplaceId !== "EBAY_US") throw new EbayPreparationError("This release supports EBAY_US only.");
  const key = `${env.ebayEnvironment}:${marketplaceId}`;
  let entry = cache.get(key);
  if (!entry || entry.expires < Date.now()) {
    const categories = (async () => {
      const token = await getEbayApplicationToken(env);
      const treeId = await callEbayInventoryApi<{ categoryTreeId: string }>(env, token, {
        path: `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${marketplaceId}`, method: "GET"
      });
      if (!treeId.ok || !/^\d+$/.test(treeId.data?.categoryTreeId ?? "")) throw new EbayPreparationError("Could not load eBay categories. Try again.");
      const response = await callEbayInventoryApi<{ rootCategoryNode: CategoryNode }>(env, token, {
        path: `/commerce/taxonomy/v1/category_tree/${treeId.data!.categoryTreeId}`, method: "GET"
      });
      if (!response.ok || !response.data?.rootCategoryNode) throw new EbayPreparationError("Could not load eBay categories. Try again.");
      const items = flattenEbayCategories(response.data.rootCategoryNode);
      if (!items.length) throw new EbayPreparationError("eBay returned an empty category tree. Try again later.");
      return items;
    })();
    entry = { expires: Date.now() + 60 * 60 * 1000, categories };
    cache.set(key, entry);
    categories.catch(() => { if (cache.get(key)?.categories === categories) cache.delete(key); });
  }
  return matchEbayCategories(await entry.categories, query);
}
