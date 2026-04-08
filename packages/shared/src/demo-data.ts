import type { ChannelConnection, Product, Workspace } from "./types";

export const demoWorkspace: Workspace = {
  id: "workspace-demo",
  name: "Northline Studio",
  subscriptionPlan: "free"
};

export const demoChannelConnections: ChannelConnection[] = [
  {
    id: "connection-shopify",
    workspaceId: demoWorkspace.id,
    channelId: "shopify",
    status: "connected",
    externalAccountId: "northline-shop",
    metadata: {
      catalogMode: "source_of_truth",
      sync: "inventory_and_orders"
    }
  },
  {
    id: "connection-ebay",
    workspaceId: demoWorkspace.id,
    channelId: "ebay",
    status: "connected",
    externalAccountId: "northline-ebay",
    metadata: {
      marketplace: "ebay_us",
      sync: "listing_and_inventory"
    }
  },
  {
    id: "connection-etsy",
    workspaceId: demoWorkspace.id,
    channelId: "etsy",
    status: "attention_required",
    externalAccountId: "northline-etsy",
    metadata: {
      reason: "reauthorization_needed"
    }
  }
];

export const demoProducts: Product[] = [
  {
    id: "prod-voyager-bag",
    title: "Voyager Canvas Weekender Bag",
    description:
      "A structured overnight bag made from waxed canvas with reinforced handles, inner zipper pockets, and a detachable shoulder strap.",
    brand: "Northline Goods",
    sku: "NLG-BAG-001",
    basePrice: 89,
    quantity: 14,
    categoryId: "bags-weekender",
    categoryLabel: "Bags > Travel Bags > Weekender Bags",
    images: [
      {
        id: "asset-bag-1",
        url: "https://images.example.com/voyager-bag/front.jpg",
        altText: "Voyager bag front view"
      },
      {
        id: "asset-bag-2",
        url: "https://images.example.com/voyager-bag/detail.jpg",
        altText: "Voyager bag fabric detail"
      }
    ],
    attributes: {
      material: "Waxed canvas",
      color: "Olive",
      primary_color: "Olive"
    },
    channelOverrides: {
      etsy: {
        title: "Voyager Canvas Weekender Bag | Handmade Style",
        price: 94
      }
    },
    variants: [
      {
        id: "variant-bag-olive",
        sku: "NLG-BAG-001-OLIVE",
        price: 89,
        quantity: 8,
        options: [{ name: "Color", value: "Olive" }]
      },
      {
        id: "variant-bag-black",
        sku: "NLG-BAG-001-BLACK",
        price: 89,
        quantity: 6,
        options: [{ name: "Color", value: "Black" }]
      }
    ]
  },
  {
    id: "prod-studio-mug",
    title: "Studio Ceramic Mug",
    description: "Hand-glazed ceramic mug for coffee and tea.",
    sku: "STU-MUG-002",
    basePrice: 24,
    quantity: 5,
    images: [
      {
        id: "asset-mug-1",
        url: "https://images.example.com/studio-mug/main.jpg",
        altText: "Ceramic mug on table"
      }
    ],
    attributes: {},
    channelOverrides: {},
    variants: []
  }
];
