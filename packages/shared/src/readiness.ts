import {
  getEffectiveProductForChannel,
  getCategoryById,
  getMappedCategoryLabel,
  requiredFieldsByChannel,
  suggestedFieldsByChannel,
  type ChannelId,
  type ChannelReadiness,
  type Product,
  type ValidationIssue
} from "./index";

function hasValue(product: Product, field: string) {
  if (field === "images") {
    return product.images.length > 0;
  }

  if (field in product) {
    const value = product[field as keyof Product];
    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    return value !== undefined && value !== null;
  }

  const attribute = product.attributes[field];
  return typeof attribute === "string" && attribute.trim().length > 0;
}

function buildFieldIssues(product: Product, channelId: ChannelId): ValidationIssue[] {
  const requiredIssues = requiredFieldsByChannel[channelId]
    .filter((field) => !hasValue(product, field))
    .map((field) => ({
      code: `required_${field}`,
      field,
      severity: "blocking" as const,
      message: `${field} is required before publishing to ${channelId}.`
    }));

  const suggestedIssues = suggestedFieldsByChannel[channelId]
    .filter((field) => !hasValue(product, field))
    .map((field) => ({
      code: `suggested_${field}`,
      field,
      severity: "suggestion" as const,
      message: `Adding ${field} will improve listing quality on ${channelId}.`
    }));

  const warningIssues: ValidationIssue[] = [];

  if (product.categoryId && channelId !== "ebay") {
    const internalCategory = getCategoryById(product.categoryId);

    if (!internalCategory) {
      warningIssues.push({
        code: "unknown_category",
        field: "categoryId",
        severity: "warning",
        message: `The selected category is not recognized by OmniList yet.`
      });
    } else if (!getMappedCategoryLabel(product.categoryId, channelId)) {
      warningIssues.push({
        code: "unmapped_channel_category",
        field: "categoryId",
        severity: "blocking",
        message: `This category is not mapped for ${channelId} yet.`
      });
    }
  }

  if (product.title.trim().length < 20) {
    warningIssues.push({
      code: "short_title",
      field: "title",
      severity: "warning",
      message: `The title is short for ${channelId}; richer titles tend to perform better.`
    });
  }

  if (product.description.trim().length < 80) {
    warningIssues.push({
      code: "short_description",
      field: "description",
      severity: "warning",
      message: `The description is brief for ${channelId}; add more buyer-facing detail.`
    });
  }

  if (product.variants.length > 0) {
    const invalidVariant = product.variants.find(
      (variant) =>
        variant.sku.trim().length === 0 ||
        !Number.isFinite(variant.price) ||
        variant.price < 0 ||
        !Number.isInteger(variant.quantity) ||
        variant.quantity < 0
    );

    if (invalidVariant) {
      warningIssues.push({
        code: "invalid_variant_payload",
        field: "variants",
        severity: "blocking",
        message: `At least one product variant has invalid SKU, price, or quantity.`
      });
    }
  }

  return [...requiredIssues, ...warningIssues, ...suggestedIssues];
}

function calculateScore(issues: ValidationIssue[]) {
  const score = issues.reduce((currentScore, issue) => {
    if (issue.severity === "blocking") {
      return currentScore - 25;
    }

    if (issue.severity === "warning") {
      return currentScore - 10;
    }

    return currentScore - 4;
  }, 100);

  return Math.max(score, 0);
}

export function validateProductForChannel(product: Product, channelId: ChannelId): ChannelReadiness {
  const effectiveProduct = getEffectiveProductForChannel(product, channelId);
  const issues = buildFieldIssues(effectiveProduct, channelId);

  if (channelId === "ebay") {
    const block = (field: string, message: string) => issues.push({ code: `ebay_${field}`, field, severity: "blocking", message });
    if (!product.channelOverrides.ebay?.condition) block("condition", "Choose the item's condition in the product's eBay settings.");
    if (effectiveProduct.title.length > 80) block("title", "eBay titles must be at most 80 characters.");
    if (product.sku.length > 50) block("sku", "eBay SKUs must be at most 50 characters.");
    if (product.quantity < 1) block("quantity", "eBay requires inventory quantity above zero.");
    if (effectiveProduct.basePrice <= 0) block("basePrice", "eBay requires a price above zero.");
    if (product.variants.length) block("variants", "This eBay release supports single-SKU products only.");
    if (product.images.some(image => !image.url.startsWith("https://"))) block("images", "eBay requires public HTTPS photos. Save uploaded photos before publishing.");
    const ebayCategoryId = product.channelOverrides.ebay?.categoryId?.trim();

    if (!ebayCategoryId) {
      issues.push({
        code: "missing_ebay_category_id",
        field: "ebayCategoryId",
        severity: "blocking",
        message: "Add a numeric eBay category ID in the product's eBay override settings."
      });
    } else if (!/^\d+$/.test(ebayCategoryId)) {
      issues.push({
        code: "invalid_ebay_category_id",
        field: "ebayCategoryId",
        severity: "blocking",
        message: "eBay category ID must contain digits only."
      });
    }
  }

  const hasBlockingIssue = issues.some((issue) => issue.severity === "blocking");

  return {
    channelId,
    score: calculateScore(issues),
    status: hasBlockingIssue ? "needs_attention" : "ready",
    issues
  };
}

export function validateProductAcrossChannels(product: Product, channelIds: ChannelId[]) {
  return channelIds.map((channelId) => validateProductForChannel(product, channelId));
}
