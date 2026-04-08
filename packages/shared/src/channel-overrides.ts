import type { ChannelId, Product } from "./types";

export function getChannelOverride(product: Product, channelId: ChannelId) {
  return product.channelOverrides[channelId];
}

export function getEffectiveProductForChannel(product: Product, channelId: ChannelId): Product {
  const override = getChannelOverride(product, channelId);

  if (!override) {
    return product;
  }

  return {
    ...product,
    title: override.title ?? product.title,
    description: override.description ?? product.description,
    basePrice: override.price ?? product.basePrice
  };
}
