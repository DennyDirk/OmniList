import {
  getBestCategoryLabel,
  getEffectiveProductForChannel,
  type ChannelDraftPreview,
  type Product
} from "@omnilist/shared";

import type { ApiEnv } from "../../../config/env";
import type { ChannelConnectionRecord } from "../../channels/channel-connections.repository";
import type { ChannelPublishExecutionResult } from "./channel-publish-registry";
import { callEbayInventoryApi, ensureValidEbayAccessToken } from "../../channels/adapters/ebay-client";

export interface ChannelPublishAdapter {
  buildDraft(product: Product, connection?: ChannelConnectionRecord): ChannelDraftPreview;
  publish(product: Product, connection: ChannelConnectionRecord): Promise<ChannelPublishExecutionResult>;
}

function getMetadataValue(connection: ChannelConnectionRecord | undefined, key: string, fallback = "") {
  return connection?.connection.metadata[key]?.trim() || fallback;
}

function buildEbayDraft(product: Product, connection?: ChannelConnectionRecord): ChannelDraftPreview {
  const effectiveProduct = getEffectiveProductForChannel(product, "ebay");
  const marketplaceId = getMetadataValue(connection, "marketplaceId", "EBAY_US");
  const merchantLocationKey = getMetadataValue(connection, "merchantLocationKey");
  const fulfillmentPolicyId = getMetadataValue(connection, "fulfillmentPolicyId");
  const paymentPolicyId = getMetadataValue(connection, "paymentPolicyId");
  const returnPolicyId = getMetadataValue(connection, "returnPolicyId");
  const condition = getMetadataValue(connection, "condition", "NEW");
  const currency = getMetadataValue(connection, "currency", "USD");
  const missingConfiguration: string[] = [];

  if (!product.categoryId) {
    missingConfiguration.push("Map the product to an OmniList category with an eBay category mapping.");
  }

  if (!merchantLocationKey) {
    missingConfiguration.push("Set eBay merchantLocationKey in the channel connection settings.");
  }

  if (!fulfillmentPolicyId) {
    missingConfiguration.push("Set eBay fulfillmentPolicyId in the channel connection settings.");
  }

  if (!paymentPolicyId) {
    missingConfiguration.push("Set eBay paymentPolicyId in the channel connection settings.");
  }

  if (!returnPolicyId) {
    missingConfiguration.push("Set eBay returnPolicyId in the channel connection settings.");
  }

  if (effectiveProduct.images.some((image) => !image.url.startsWith("https://"))) {
    missingConfiguration.push("eBay listings require HTTPS image URLs.");
  }

  if (effectiveProduct.quantity <= 0) {
    missingConfiguration.push("eBay listings require inventory quantity above zero.");
  }

  if (effectiveProduct.variants.length > 0) {
    missingConfiguration.push("Multi-variation eBay listings are not supported yet. Publish a single-SKU product first.");
  }

  const inventoryItemPayload = {
    availability: {
      shipToLocationAvailability: {
        quantity: effectiveProduct.quantity
      }
    },
    condition,
    imageUrls: effectiveProduct.images.map((image) => image.url),
    product: {
      title: effectiveProduct.title,
      description: effectiveProduct.description,
      aspects: Object.fromEntries(
        Object.entries({
          Brand: effectiveProduct.brand,
          Material: effectiveProduct.attributes.material,
          Color: effectiveProduct.attributes.color
        }).filter(([, value]) => typeof value === "string" && value.trim().length > 0)
      )
    }
  };

  const offerPayload = {
    sku: effectiveProduct.sku,
    marketplaceId,
    format: "FIXED_PRICE",
    availableQuantity: effectiveProduct.quantity,
    categoryId: product.categoryId,
    merchantLocationKey,
    listingDescription: effectiveProduct.description,
    pricingSummary: {
      price: {
        value: effectiveProduct.basePrice.toFixed(2),
        currency
      }
    },
    listingPolicies: {
      fulfillmentPolicyId,
      paymentPolicyId,
      returnPolicyId
    }
  };

  return {
    channelId: "ebay",
    channelName: "eBay",
    title: effectiveProduct.title,
    price: effectiveProduct.basePrice,
    categoryLabel: getBestCategoryLabel(product, "ebay"),
    listingFormat: "FIXED_PRICE",
    missingConfiguration,
    payload: {
      inventoryItemPayload,
      offerPayload
    }
  };
}

export function createEbayPublishAdapter(env: ApiEnv): ChannelPublishAdapter {
  return {
    buildDraft(product, connection) {
      return buildEbayDraft(product, connection);
    },
    async publish(product, connection) {
      const draft = buildEbayDraft(product, connection);

      if (!env.ebayClientId || !env.ebayClientSecret) {
        return {
          status: "failed",
          message: "eBay application credentials are not configured on the server."
        };
      }

      if (draft.missingConfiguration.length > 0) {
        return {
          status: "failed",
          message: draft.missingConfiguration[0]
        };
      }

      if (!connection.credentials.accessToken && !connection.credentials.refreshToken) {
        return {
          status: "failed",
          message: "eBay OAuth connection is missing access credentials."
        };
      }

      const auth = await ensureValidEbayAccessToken(env, connection.credentials);

      const inventoryResponse = await callEbayInventoryApi<{ errors?: Array<{ message?: string }> }>(env, auth.accessToken, {
        path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(product.sku)}`,
        method: "PUT",
        body: (draft.payload as { inventoryItemPayload: unknown }).inventoryItemPayload
      });

      if (!inventoryResponse.ok) {
        return {
          status: "failed",
          message: inventoryResponse.data?.errors?.[0]?.message ?? "eBay inventory item creation failed.",
          updatedCredentials: auth.credentials
        };
      }

      const offerPayload = (draft.payload as { offerPayload: Record<string, unknown> }).offerPayload;

      const offerSearch = await callEbayInventoryApi<{
        offers?: Array<{ offerId: string; status?: string; listing?: { listingId?: string } }>;
        errors?: Array<{ message?: string }>;
      }>(env, auth.accessToken, {
        path:
          `/sell/inventory/v1/offer?sku=${encodeURIComponent(product.sku)}` +
          `&marketplace_id=${encodeURIComponent(String(offerPayload.marketplaceId))}` +
          `&format=${encodeURIComponent(String(offerPayload.format))}`,
        method: "GET"
      });

      if (!offerSearch.ok) {
        return {
          status: "failed",
          message: offerSearch.data?.errors?.[0]?.message ?? "eBay offer lookup failed.",
          updatedCredentials: auth.credentials
        };
      }

      const existingOffer = offerSearch.data?.offers?.find((offer) => offer.offerId);

      let offerId = existingOffer?.offerId;

      if (offerId) {
        const updateResponse = await callEbayInventoryApi<{ errors?: Array<{ message?: string }> }>(env, auth.accessToken, {
          path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
          method: "PUT",
          body: offerPayload
        });

        if (!updateResponse.ok) {
          return {
            status: "failed",
            message: updateResponse.data?.errors?.[0]?.message ?? "eBay offer update failed.",
            updatedCredentials: auth.credentials
          };
        }

        if (existingOffer?.status === "PUBLISHED") {
          return {
            status: "published",
            message: existingOffer.listing?.listingId
              ? `Updated live eBay listing ${existingOffer.listing.listingId}.`
              : "Updated live eBay listing.",
            updatedCredentials: auth.credentials
          };
        }
      } else {
        const createOfferResponse = await callEbayInventoryApi<{
          offerId?: string;
          errors?: Array<{ message?: string }>;
        }>(env, auth.accessToken, {
          path: "/sell/inventory/v1/offer",
          method: "POST",
          body: offerPayload
        });

        if (!createOfferResponse.ok || !createOfferResponse.data?.offerId) {
          return {
            status: "failed",
            message: createOfferResponse.data?.errors?.[0]?.message ?? "eBay offer creation failed.",
            updatedCredentials: auth.credentials
          };
        }

        offerId = createOfferResponse.data.offerId;
      }

      const publishResponse = await callEbayInventoryApi<{
        listingId?: string;
        errors?: Array<{ message?: string }>;
      }>(env, auth.accessToken, {
        path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId!)}/publish`,
        method: "POST"
      });

      if (!publishResponse.ok) {
        return {
          status: "failed",
          message: publishResponse.data?.errors?.[0]?.message ?? "eBay publish offer failed.",
          updatedCredentials: auth.credentials
        };
      }

      return {
        status: "published",
        message: publishResponse.data?.listingId
          ? `Published to eBay listing ${publishResponse.data.listingId}.`
          : "Published to eBay successfully.",
        updatedCredentials: auth.credentials
      };
    }
  };
}
