import type { ApiEnv } from "../../../config/env";
import { getEbayBaseUrls } from "./ebay-client";

export class EbayTradingReadError extends Error {
  constructor(public readonly reconnect = false) {
    super(reconnect ? "Reconnect eBay to read active listings." : "Could not read active eBay listings. Try again.");
  }
}

// Only read calls are allowed; callers construct XML from validated inputs.
export async function callEbayTradingRead(env: ApiEnv, token: string, call: "GetMyeBaySelling" | "GetItem", fields: string) {
  try {
    const response = await fetch(`${getEbayBaseUrls(env.ebayEnvironment).apiBaseUrl}/ws/api.dll`, {
      method: "POST", signal: AbortSignal.timeout(15_000), redirect: "error",
      headers: {
        "Content-Type": "text/xml; charset=utf-8", "X-EBAY-API-CALL-NAME": call,
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1477", "X-EBAY-API-SITEID": "0", "X-EBAY-API-IAF-TOKEN": token
      },
      body: `<?xml version="1.0" encoding="utf-8"?><${call}Request xmlns="urn:ebay:apis:eBLBaseComponents">${fields}</${call}Request>`
    });
    if (!response.ok) throw new EbayTradingReadError(response.status === 401 || response.status === 403);
    const reader = response.body?.getReader();
    if (!reader) throw new EbayTradingReadError();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) throw new EbayTradingReadError();
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    throw error instanceof EbayTradingReadError ? error : new EbayTradingReadError();
  }
}
