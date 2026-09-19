import type { ApiEnv } from "../../../config/env";

export function createEtsyRequester(env: ApiEnv, fetcher: typeof fetch = fetch) {
  return async (url: string, init: RequestInit, errorCode: string): Promise<unknown> => {
    if (!env.etsyKeystring || !env.etsySharedSecret) throw new Error("CHANNEL_CONNECTOR_NOT_CONFIGURED");
    try {
      const response = await fetcher(url, {
        ...init, redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(15_000), ...(init.signal ? [init.signal] : [])]),
        headers: { Accept: "application/json", "x-api-key": `${env.etsyKeystring}:${env.etsySharedSecret}`, ...init.headers }
      });
      if (response.status === 404 && errorCode === "ETSY_SHOP_LOOKUP_FAILED") throw new Error("ETSY_SHOP_NOT_FOUND");
      if (errorCode === "ETSY_SETUP_FAILED" || errorCode === "ETSY_REFRESH_FAILED") {
        if ([401, 403].includes(response.status) || (errorCode === "ETSY_REFRESH_FAILED" && response.status === 400)) throw new Error("ETSY_RECONNECT_REQUIRED");
        if (response.status === 429) throw new Error("ETSY_RATE_LIMITED");
      }
      if (!response.ok) throw new Error(errorCode);
      return await response.json();
    } catch (error) {
      // Do not expose request credentials or provider error echoes in logs or UI.
      if (error instanceof Error && ["ETSY_SHOP_NOT_FOUND", "ETSY_RECONNECT_REQUIRED", "ETSY_RATE_LIMITED"].includes(error.message)) throw error;
      throw new Error(errorCode);
    }
  };
}
