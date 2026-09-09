import type { Product } from "./types";

// Inventory uses enums; Metadata returns numeric IDs. Never infer these from labels.
export const ebayConditionIds: Record<string, string> = {
  NEW: "1000", NEW_OTHER: "1500", NEW_WITH_DEFECTS: "1750",
  CERTIFIED_REFURBISHED: "2000", EXCELLENT_REFURBISHED: "2010",
  VERY_GOOD_REFURBISHED: "2020", GOOD_REFURBISHED: "2030",
  SELLER_REFURBISHED: "2500", LIKE_NEW: "2750", PRE_OWNED_EXCELLENT: "2990",
  USED_EXCELLENT: "3000", USED_VERY_GOOD: "4000", USED_GOOD: "5000",
  PRE_OWNED_FAIR: "3010", USED_ACCEPTABLE: "6000", FOR_PARTS_OR_NOT_WORKING: "7000"
};

export interface EbayCategoryRequirements {
  marketplaceId: string;
  categoryId: string;
  categoryName: string;
  conditions: Array<{ value: string; label: string; supported: boolean }>;
  aspects: Array<{
    name: string;
    required: boolean;
    selectionOnly: boolean;
    multiple: boolean;
    maxLength: number;
    values: Array<{
      value: string;
      constraints?: Array<{ name: string; values: string[] }>;
    }>;
  }>;
}

export function buildEbayAspects(product: Product): Record<string, string[]> {
  const defaults = Object.fromEntries(
    Object.entries({ Brand: product.brand, Material: product.attributes.material, Color: product.attributes.color })
      .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
      .map(([key, value]) => [key, [value.trim()]])
  );
  return Object.fromEntries(Object.entries({ ...defaults, ...product.channelOverrides.ebay?.aspects })
    .map(([key, values]) => [key, [...new Set(values.map(value => value.trim()).filter(Boolean))]])
    .filter(([, values]) => (values as string[]).length > 0));
}

export function validateEbayCategory(
  requirements: EbayCategoryRequirements,
  condition: string | undefined,
  aspects: Record<string, string[]>
): string[] {
  const issues: string[] = [];
  const selected = requirements.conditions.find(item => item.value === condition);
  if (!selected) {
    issues.push(`Choose an allowed condition for ${requirements.categoryName} (${requirements.categoryId}) in the product's eBay settings.`);
  } else if (!selected.supported) {
    issues.push(`${requirements.categoryName} requires condition grading that this MVP does not support. Choose the category that actually describes your product.`);
  }

  for (const aspect of requirements.aspects) {
    const values = aspects[aspect.name] ?? [];
    if (aspect.required && values.length === 0) issues.push(`Add ${aspect.name} for ${requirements.categoryName}.`);
    if (!aspect.multiple && values.length > 1) issues.push(`Choose one value for ${aspect.name}.`);
    if (values.some(value => value.length > aspect.maxLength)) issues.push(`${aspect.name} must be at most ${aspect.maxLength} characters.`);
    for (const value of values) {
      const allowed = aspect.values.find(item => item.value === value);
      if (aspect.selectionOnly && !allowed) issues.push(`Choose an eBay value for ${aspect.name}: ${value} is not allowed.`);
      if (allowed?.constraints?.some(constraint => !constraint.values.some(item => aspects[constraint.name]?.includes(item)))) {
        issues.push(`Check ${aspect.name}: ${value} is not compatible with the other item specifics.`);
      }
    }
  }
  return issues;
}
