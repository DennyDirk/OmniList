import type { ChannelId, Product } from "./types";

export interface InternalCategory {
  id: string;
  label: string;
  keywords: string[];
  channelMappings: Partial<Record<ChannelId, { label: string }>>;
}

export const internalCategories: InternalCategory[] = [
  {
    id: "bags-weekender",
    label: "Bags > Travel Bags > Weekender Bags",
    keywords: ["bag", "weekender", "duffel", "travel", "canvas", "overnight"],
    channelMappings: {
      shopify: { label: "Bags / Travel Bags / Weekender Bags" },
      ebay: { label: "Luggage & Travel Accessories > Travel Bags > Duffel Bags" },
      etsy: { label: "Bags & Purses > Duffel Bags" }
    }
  },
  {
    id: "drinkware-mug",
    label: "Home & Living > Kitchen & Dining > Drinkware > Mugs",
    keywords: ["mug", "cup", "ceramic", "coffee", "tea", "drinkware"],
    channelMappings: {
      shopify: { label: "Kitchen & Dining / Drinkware / Mugs" },
      ebay: { label: "Home & Garden > Kitchen, Dining & Bar > Dinnerware & Serveware > Mugs" },
      etsy: { label: "Home & Living > Kitchen & Dining > Drink & Barware > Mugs" }
    }
  },
  {
    id: "apparel-tshirt",
    label: "Apparel > Shirts & Tops > T-Shirts",
    keywords: ["t-shirt", "tee", "shirt", "cotton", "apparel", "clothing"],
    channelMappings: {
      shopify: { label: "Apparel / Shirts / T-Shirts" },
      ebay: { label: "Clothing, Shoes & Accessories > Men > Men's Clothing > T-Shirts" },
      etsy: { label: "Clothing > Tops & Tees > T-Shirts" }
    }
  },
  {
    id: "jewelry-necklace",
    label: "Jewelry > Necklaces > Pendant Necklaces",
    keywords: ["necklace", "pendant", "jewelry", "jewellery", "chain"],
    channelMappings: {
      shopify: { label: "Jewelry / Necklaces / Pendant Necklaces" },
      ebay: { label: "Jewelry & Watches > Fashion Jewelry > Necklaces & Pendants" },
      etsy: { label: "Jewelry > Necklaces > Pendants" }
    }
  },
  {
    id: "home-candle",
    label: "Home & Living > Home Fragrance > Candles",
    keywords: ["candle", "soy", "fragrance", "scented", "wax", "jar candle"],
    channelMappings: {
      shopify: { label: "Home Fragrance / Candles" },
      ebay: { label: "Home & Garden > Home Fragrance > Candles" },
      etsy: { label: "Home & Living > Home Fragrance > Candles" }
    }
  },
  {
    id: "art-print",
    label: "Art & Collectibles > Prints > Wall Art Prints",
    keywords: ["print", "poster", "wall art", "artwork", "illustration", "art"],
    channelMappings: {
      shopify: { label: "Art / Prints / Wall Art" },
      ebay: { label: "Art > Art Prints" },
      etsy: { label: "Art & Collectibles > Prints > Digital Prints" }
    }
  }
];

function normalizeText(value: string) {
  return value.toLowerCase().trim();
}

export function getCategoryById(categoryId?: string) {
  if (!categoryId) {
    return undefined;
  }

  return internalCategories.find((category) => category.id === categoryId);
}

export function getMappedCategoryLabel(categoryId: string | undefined, channelId: ChannelId) {
  const category = getCategoryById(categoryId);

  if (!category) {
    return undefined;
  }

  return category.channelMappings[channelId]?.label;
}

export function getBestCategoryLabel(product: Product, channelId: ChannelId) {
  return getMappedCategoryLabel(product.categoryId, channelId) ?? product.categoryLabel;
}

export function suggestCategoriesFromText(text: string, limit = 3) {
  const normalized = normalizeText(text);

  if (normalized.length === 0) {
    return [];
  }

  return internalCategories
    .map((category) => {
      const score = category.keywords.reduce((currentScore, keyword) => {
        return normalized.includes(normalizeText(keyword)) ? currentScore + 1 : currentScore;
      }, 0);

      return {
        category,
        score
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.category);
}

export function suggestCategoriesForProduct(productLike: Pick<Product, "title" | "description" | "attributes">) {
  const attributesText = Object.values(productLike.attributes).join(" ");
  const combinedText = [productLike.title, productLike.description, attributesText].filter(Boolean).join(" ");
  return suggestCategoriesFromText(combinedText);
}
