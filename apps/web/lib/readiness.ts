import { channels, demoProducts, validateProductForChannel, type Product } from "@omnilist/shared";

export const getReadiness = validateProductForChannel;
export const getProducts = () => demoProducts;
export const getChannels = () => channels;
export const getProduct = (id: string) => demoProducts.find(product => product.id === id);
export const getReadinessForAllChannels = (product: Product) => channels.map(channel => ({
  channel,
  readiness: getReadiness(product, channel.id)
}));
