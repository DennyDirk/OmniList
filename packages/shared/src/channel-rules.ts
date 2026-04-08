import type { Channel, ChannelId } from "./types";

export const channels: Channel[] = [
  {
    id: "shopify",
    name: "Shopify",
    kind: "store",
    region: "Global",
    description: "Connected commerce channel and source catalog."
  },
  {
    id: "ebay",
    name: "eBay",
    kind: "marketplace",
    region: "Global",
    description: "Strong SMB marketplace with mature listing and taxonomy support."
  },
  {
    id: "etsy",
    name: "Etsy",
    kind: "marketplace",
    region: "Global",
    description: "Marketplace with strong fit for handmade, niche, and creative products."
  }
];

export const requiredFieldsByChannel: Record<ChannelId, string[]> = {
  shopify: ["title", "description", "basePrice", "quantity", "images"],
  ebay: ["title", "description", "basePrice", "quantity", "images", "categoryId", "brand"],
  etsy: ["title", "description", "basePrice", "quantity", "images", "categoryId"]
};

export const suggestedFieldsByChannel: Record<ChannelId, string[]> = {
  shopify: ["categoryId"],
  ebay: ["material", "color"],
  etsy: ["material", "primary_color"]
};

