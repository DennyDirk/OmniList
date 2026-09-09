import {
  getBestCategoryLabel,
  getEffectiveProductForChannel,
  buildEbayAspects,
  validateEbayCategory,
  type ChannelDraftPreview,
  type Product
} from "@omnilist/shared";

import type { ApiEnv } from "../../../config/env";
import type { ChannelConnectionRecord } from "../../channels/channel-connections.repository";
import type { ChannelPublishExecutionResult } from "./channel-publish-registry";
import { callEbayInventoryApi, ensureValidEbayAccessToken } from "../../channels/adapters/ebay-client";
import { EbayPreparationError, getEbayCategoryRequirements } from "../../channels/adapters/ebay-category";

export interface ChannelPublishAdapter {
  buildDraft(product: Product, connection?: ChannelConnectionRecord): ChannelDraftPreview;
  publish(product: Product, connection: ChannelConnectionRecord): Promise<ChannelPublishExecutionResult>;
}

interface EbayApiErrorShape {
  errorId?: number | string;
  message?: string;
  longMessage?: string;
  parameters?: Array<{
    name?: string;
    value?: string;
  }>;
}

interface EbayOfferSummary {
  offerId: string;
  status?: string;
  listing?: {
    listingId?: string;
    listingStatus?: string;
  };
}

function getMetadataValue(connection: ChannelConnectionRecord | undefined, key: string, fallback = "") {
  return connection?.connection.metadata[key]?.trim() || fallback;
}

function getOfferStatus(offer: EbayOfferSummary) {
  return offer.status?.trim().toUpperCase();
}

function isPublishedOffer(offer: EbayOfferSummary) {
  return !isEndedOffer(offer) && getOfferStatus(offer) === "PUBLISHED" && Boolean(offer.listing?.listingId);
}

function isEndedOffer(offer: EbayOfferSummary) {
  const listingStatus = offer.listing?.listingStatus?.trim().toUpperCase();
  return getOfferStatus(offer) === "ENDED" || listingStatus === "ENDED" || listingStatus === "UNAVAILABLE";
}

function isPublishableOffer(offer: EbayOfferSummary) {
  const status = getOfferStatus(offer);
  return !isEndedOffer(offer) && (!status || status === "UNPUBLISHED");
}

function selectReusableOffer(offers: EbayOfferSummary[] = []) {
  const offersWithId = offers.filter((offer) => offer.offerId && !isEndedOffer(offer));
  return offersWithId.find(isPublishedOffer) ?? offersWithId.find(isPublishableOffer);
}

function isOfferUnavailableResponse(response: {
  data?: {
    errors?: EbayApiErrorShape[];
  };
  rawText?: string;
}) {
  const errors = response.data?.errors ?? [];

  return (
    errors.some((error) => {
      const errorId = error.errorId !== undefined ? String(error.errorId) : "";
      const errorMessage = [error.message, error.longMessage].filter(Boolean).join(" ");
      return errorId === "25713" || /this offer is not available/i.test(errorMessage);
    }) || /this offer is not available/i.test(response.rawText ?? "")
  );
}

function addUnavailableOfferHint(message: string) {
  return `${message} Check this SKU and its offer in eBay before retrying. Do not change the SKU to bypass this error; that can create a duplicate listing.`;
}

function formatEbayError(
  response: {
    data?: {
      errors?: EbayApiErrorShape[];
    };
    rawText?: string;
  },
  fallbackMessage: string
) {
  const error = response.data?.errors?.[0];

  if (error) {
    const details = [
      error.longMessage?.trim() || error.message?.trim(),
      error.parameters
        ?.filter((parameter) => parameter.name?.trim() && !/^\d+$/.test(parameter.name) && parameter.value?.trim())
        .map((parameter) => `${parameter.name}: ${parameter.value}`)
        .join(", ")
    ].filter(Boolean);

    if (details.length > 0) {
      return `${fallbackMessage.replace(/[.:]+$/, "")} [${error.errorId ?? "unknown"}]: ${details.join("; ").slice(0, 700)}`;
    }
  }

  if (response.rawText?.trim()) {
    return `${fallbackMessage} eBay returned an unreadable response. Check this SKU on eBay before retrying.`;
  }

  return fallbackMessage;
}

function buildEbayDraft(product: Product, connection?: ChannelConnectionRecord): ChannelDraftPreview {
  const effectiveProduct = getEffectiveProductForChannel(product, "ebay");
  const ebayCategoryId = product.channelOverrides.ebay?.categoryId?.trim() || "";
  const marketplaceId = getMetadataValue(connection, "marketplaceId", "EBAY_US");
  const merchantLocationKey = getMetadataValue(connection, "merchantLocationKey");
  const fulfillmentPolicyId = getMetadataValue(connection, "fulfillmentPolicyId");
  const paymentPolicyId = getMetadataValue(connection, "paymentPolicyId");
  const returnPolicyId = getMetadataValue(connection, "returnPolicyId");
  const condition = product.channelOverrides.ebay?.condition;
  const currency = getMetadataValue(connection, "currency", "USD");
  const missingConfiguration: string[] = [];

  if (marketplaceId !== "EBAY_US" || currency !== "USD") {
    missingConfiguration.push("The first eBay publishing release supports EBAY_US with USD only.");
  }
  if (!condition) missingConfiguration.push("Choose the item's condition in the product's eBay settings, not in channel settings.");
  if (effectiveProduct.title.length > 80) missingConfiguration.push("eBay titles must be at most 80 characters.");
  if (effectiveProduct.sku.length > 50) missingConfiguration.push("eBay SKUs must be at most 50 characters.");
  if (effectiveProduct.basePrice <= 0) missingConfiguration.push("Set a price above zero before publishing.");
  if (!effectiveProduct.images.length) missingConfiguration.push("Add at least one product photo.");

  if (!ebayCategoryId) {
    missingConfiguration.push("Set a numeric eBay category ID in the product's eBay override settings.");
  } else if (!/^\d+$/.test(ebayCategoryId)) {
    missingConfiguration.push("eBay category ID must be numeric.");
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
    conditionDescription: product.channelOverrides.ebay?.conditionDescription || undefined,
    product: {
      imageUrls: effectiveProduct.images.map((image) => image.url),
      title: effectiveProduct.title,
      description: effectiveProduct.description,
      aspects: buildEbayAspects(effectiveProduct)
    }
  };

  const offerPayload = {
    sku: effectiveProduct.sku,
    marketplaceId,
    format: "FIXED_PRICE",
    listingDuration: "GTC",
    availableQuantity: effectiveProduct.quantity,
    categoryId: ebayCategoryId,
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
      const payload = draft.payload as { inventoryItemPayload: unknown; offerPayload: Record<string, unknown> };
      const offerPayload = payload.offerPayload;
      const sku = String(offerPayload.sku);

      try {
        const requirements = await getEbayCategoryRequirements(env, auth.accessToken, String(offerPayload.marketplaceId), String(offerPayload.categoryId));
        const issues = validateEbayCategory(requirements, product.channelOverrides.ebay?.condition, buildEbayAspects(product));
        if (issues.length) return { status: "failed", message: issues.join(" "), updatedCredentials: auth.credentials };
      } catch (error) {
        return {
          status: "failed",
          message: error instanceof EbayPreparationError ? error.message : "Could not load eBay category requirements. No listing was sent. Check the connection and try again.",
          updatedCredentials: auth.credentials
        };
      }

      const inventoryResponse = await callEbayInventoryApi<{ errors?: EbayApiErrorShape[] }>(env, auth.accessToken, {
        path: `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
        method: "PUT",
        body: payload.inventoryItemPayload
      });

      if (!inventoryResponse.ok) {
        return {
          status: "failed",
          message: formatEbayError(inventoryResponse, "eBay inventory item creation failed."),
          updatedCredentials: auth.credentials
        };
      }

      const offerSearch = await callEbayInventoryApi<{
        offers?: EbayOfferSummary[];
        errors?: EbayApiErrorShape[];
      }>(env, auth.accessToken, {
        path:
          `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}` +
          `&marketplace_id=${encodeURIComponent(String(offerPayload.marketplaceId))}` +
          `&format=${encodeURIComponent(String(offerPayload.format))}`,
        method: "GET"
      });

      if (!offerSearch.ok) {
        if (!isOfferUnavailableResponse(offerSearch)) {
          return {
            status: "failed",
            message: formatEbayError(offerSearch, "eBay offer lookup failed."),
            updatedCredentials: auth.credentials
          };
        }
      }

      const existingOffer = selectReusableOffer(offerSearch.data?.offers);

      let offerId = existingOffer?.offerId;
      let shouldCreateOffer = !offerId;

      if (offerId) {
        const updateResponse = await callEbayInventoryApi<{ errors?: EbayApiErrorShape[] }>(env, auth.accessToken, {
          path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
          method: "PUT",
          body: offerPayload
        });

        if (!updateResponse.ok) {
          if (!isOfferUnavailableResponse(updateResponse)) {
            return {
              status: "failed",
              message: formatEbayError(updateResponse, "eBay offer update failed."),
              updatedCredentials: auth.credentials
            };
          }

          offerId = undefined;
          shouldCreateOffer = true;
        }

        if (offerId && existingOffer && isPublishedOffer(existingOffer)) {
          return {
            status: "published",
            message: existingOffer.listing?.listingId
              ? `Updated live eBay listing ${existingOffer.listing.listingId}.`
              : "Updated live eBay listing.",
            updatedCredentials: auth.credentials
          };
        }
      }

      if (shouldCreateOffer) {
        const createOfferResponse = await callEbayInventoryApi<{
          offerId?: string;
          errors?: EbayApiErrorShape[];
        }>(env, auth.accessToken, {
          path: "/sell/inventory/v1/offer",
          method: "POST",
          body: offerPayload
        });

        if (!createOfferResponse.ok || !createOfferResponse.data?.offerId) {
          const message = formatEbayError(createOfferResponse, "eBay offer creation failed.");

          return {
            status: "failed",
            message: isOfferUnavailableResponse(createOfferResponse) ? addUnavailableOfferHint(message) : message,
            updatedCredentials: auth.credentials
          };
        }

        offerId = createOfferResponse.data.offerId;
      }

      const publishResponse = await callEbayInventoryApi<{
        listingId?: string;
        errors?: EbayApiErrorShape[];
      }>(env, auth.accessToken, {
        path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId!)}/publish`,
        method: "POST"
      });

      if (!publishResponse.ok) {
        if (isOfferUnavailableResponse(publishResponse)) {
          const offerDetailsResponse = await callEbayInventoryApi<EbayOfferSummary & { errors?: EbayApiErrorShape[] }>(env, auth.accessToken, {
            path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId!)}`,
            method: "GET"
          });

          if (offerDetailsResponse.ok && offerDetailsResponse.data && isPublishedOffer(offerDetailsResponse.data)) {
            return {
              status: "published",
              message: offerDetailsResponse.data.listing?.listingId
                ? `Updated live eBay listing ${offerDetailsResponse.data.listing.listingId}.`
                : "Updated live eBay listing.",
              updatedCredentials: auth.credentials
            };
          }
        }

        const message = formatEbayError(publishResponse, "eBay publish offer failed.");

        return {
          status: "failed",
          message: isOfferUnavailableResponse(publishResponse) ? addUnavailableOfferHint(message) : message,
          updatedCredentials: auth.credentials
        };
      }

      return {
        status: publishResponse.data?.listingId ? "published" : "failed",
        message: publishResponse.data?.listingId
          ? `Published to eBay listing ${publishResponse.data.listingId}.`
          : "eBay did not confirm a listing ID. Check this SKU on eBay before retrying.",
        updatedCredentials: auth.credentials
      };
    }
  };
}
