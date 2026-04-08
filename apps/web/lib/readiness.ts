import {
  channels,
  demoProducts,
  getCategoryById,
  getEffectiveProductForChannel,
  getMappedCategoryLabel,
  requiredFieldsByChannel,
  suggestedFieldsByChannel,
  type ChannelId,
  type ChannelReadiness,
  type Product
} from "@omnilist/shared";

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

  return Boolean(product.attributes[field]?.trim());
}

export function getProducts() {
  return demoProducts;
}

export function getChannels() {
  return channels;
}

export function getProduct(productId: string) {
  return demoProducts.find((product) => product.id === productId);
}

export function getReadiness(product: Product, channelId: ChannelId): ChannelReadiness {
  const effectiveProduct = getEffectiveProductForChannel(product, channelId);

  const issues = [
    ...requiredFieldsByChannel[channelId]
      .filter((field) => !hasValue(effectiveProduct, field))
      .map((field) => ({
        code: `required_${field}`,
        field,
        severity: "blocking" as const,
        message: `${field} is required for ${channelId}.`
      })),
    ...suggestedFieldsByChannel[channelId]
      .filter((field) => !hasValue(effectiveProduct, field))
      .map((field) => ({
        code: `suggested_${field}`,
        field,
        severity: "suggestion" as const,
        message: `Add ${field} to improve listing quality on ${channelId}.`
      })),
    ...(effectiveProduct.categoryId
      ? !getCategoryById(effectiveProduct.categoryId)
        ? [
            {
              code: "unknown_category",
              field: "categoryId",
              severity: "warning" as const,
              message: "The selected category is not recognized by OmniList yet."
            }
          ]
        : !getMappedCategoryLabel(effectiveProduct.categoryId, channelId)
          ? [
              {
                code: "unmapped_channel_category",
                field: "categoryId",
                severity: "blocking" as const,
                message: `This category is not mapped for ${channelId} yet.`
              }
            ]
          : []
      : []),
    ...(effectiveProduct.variants.some(
      (variant) =>
        variant.sku.trim().length === 0 ||
        !Number.isFinite(variant.price) ||
        variant.price < 0 ||
        !Number.isInteger(variant.quantity) ||
        variant.quantity < 0
    )
      ? [
          {
            code: "invalid_variant_payload",
            field: "variants",
            severity: "blocking" as const,
            message: "At least one product variant has invalid SKU, price, or quantity."
          }
        ]
      : [])
  ];

  const score = Math.max(
    0,
    issues.reduce((currentScore, issue) => {
      if (issue.severity === "blocking") {
        return currentScore - 25;
      }

      return currentScore - 4;
    }, 100)
  );

  return {
    channelId,
    score,
    status: issues.some((issue) => issue.severity === "blocking") ? "needs_attention" : "ready",
    issues
  };
}

export function getReadinessForAllChannels(product: Product) {
  return channels.map((channel) => ({
    channel,
    readiness: getReadiness(product, channel.id)
  }));
}
