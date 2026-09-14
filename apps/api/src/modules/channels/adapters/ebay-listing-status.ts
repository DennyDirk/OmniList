import type { ApiEnv } from "../../../config/env";
import { callEbayInventoryApi } from "./ebay-client";
import { EbayPreparationError } from "./ebay-category";

export async function getEbayListingStatus(env: ApiEnv, token: string, sku: string, marketplaceId: string) {
  const response = await callEbayInventoryApi<{
    offers?: Array<{ offerId: string; sku?: string; status?: string; listing?: { listingId?: string; listingStatus?: string } }>;
    errors?: Array<{ errorId?: number; message?: string }>;
  }>(env, token, {
    path: `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${encodeURIComponent(marketplaceId)}&format=FIXED_PRICE`,
    method: "GET"
  });
  const noOffers = response.status === 404 && response.data?.errors?.some(error => error.errorId === 25713);
  if (!noOffers && (!response.ok || !Array.isArray(response.data?.offers))) {
    throw new EbayPreparationError(`Could not verify the listing on eBay (HTTP ${response.status}). No changes were made.`);
  }
  return {
    sku,
    environment: env.ebayEnvironment,
    marketplaceId,
    checkedAt: new Date().toISOString(),
    offers: (noOffers ? [] : response.data?.offers ?? []).map(offer => {
      const listingId = offer.listing?.listingId;
      return {
        offerId: offer.offerId,
        status: offer.status ?? "UNKNOWN",
        listingStatus: offer.listing?.listingStatus,
        listingId,
        url: listingId && /^\d+$/.test(listingId) ? `https://${env.ebayEnvironment === "sandbox" ? "www.sandbox.ebay.com" : "www.ebay.com"}/itm/${listingId}` : undefined
      };
    })
  };
}

export async function getEbayOfferStatus(env: ApiEnv, token: string, offerId: string, marketplaceId: string) {
  const response = await callEbayInventoryApi<{
    offerId?: string;
    sku?: string;
    marketplaceId?: string;
    status?: string;
    listing?: {
      listingId?: string;
      listingStatus?: string;
    };
    errors?: Array<{ errorId?: number; message?: string }>;
  }>(env, token, {
    path: `/sell/inventory/v1/offer/${encodeURIComponent(offerId)}`,
    method: "GET"
  });

  const offerNotFound = response.status === 404 && response.data?.errors?.some(error => error.errorId === 25713);
  if (!response.ok && !offerNotFound) {
    throw new EbayPreparationError(`Could not check offer status on eBay (HTTP ${response.status}). Verify the offer exists and reconnect if needed.`);
  }

  if (offerNotFound) {
    return {
      offerId,
      marketplaceId,
      environment: env.ebayEnvironment,
      status: "NOT_FOUND",
      listingId: undefined,
      listingStatus: undefined,
      checkedAt: new Date().toISOString()
    };
  }

  const offer = response.data;
  if (!offer || offer.offerId !== offerId || offer.marketplaceId !== marketplaceId || !offer.sku || !offer.status) {
    throw new EbayPreparationError("eBay returned an incomplete or mismatched offer. Check the listing again.");
  }
  const listingId = offer?.listing?.listingId;
  return {
    offerId: offer?.offerId ?? offerId,
    marketplaceId,
    environment: env.ebayEnvironment,
    sku: offer?.sku,
    status: offer?.status ?? "UNKNOWN",
    listingId,
    listingStatus: offer?.listing?.listingStatus,
    url: listingId && /^\d+$/.test(listingId) ? `https://${env.ebayEnvironment === "sandbox" ? "www.sandbox.ebay.com" : "www.ebay.com"}/itm/${listingId}` : undefined,
    checkedAt: new Date().toISOString()
  };
}
