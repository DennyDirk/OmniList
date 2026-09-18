"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ChannelConnection } from "@omnilist/shared";
import { dictionaries, formatConnectionStatus, type Locale } from "../lib/i18n";
import { etsyCopy } from "../lib/etsy-copy";
import { useFlash } from "./flash-provider";

export function EtsyConnectionCard({ apiBaseUrl, connection, enabled, locale }: {
  apiBaseUrl: string; connection?: ChannelConnection; enabled: boolean; locale: Locale;
}) {
  const dictionary = dictionaries[locale];
  const copy = etsyCopy[locale];
  const router = useRouter();
  const { showFlash } = useFlash();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const lock = useRef(false);
  const connected = connection?.status === "connected";
  const disabled = busy || pending;
  function connect() {
    if (disabled || lock.current || !enabled) return;
    lock.current = true;
    setBusy(true);
    window.location.assign(`${apiBaseUrl}/channel-connections/etsy/connect/start`);
  }
  async function disconnect() {
    if (disabled || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch(`${apiBaseUrl}/channel-connections/etsy/disconnect`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("disconnect failed");
      showFlash({ tone: "success", message: dictionary.channelManager.disconnectedChannel("Etsy") });
      startTransition(() => router.refresh());
    } catch {
      showFlash({ tone: "error", message: dictionary.channelManager.couldNotDisconnect });
    } finally { lock.current = false; setBusy(false); }
  }
  return <section className="card" aria-labelledby="etsy-connection-title">
    <div className="row"><h2 id="etsy-connection-title">Etsy</h2><span className={"pill " + (connected ? "ready" : "attention")}>{formatConnectionStatus(dictionary, connection?.status ?? "disconnected")}</span></div>
    <p>{connected ? connection.metadata.shopName || "Etsy" : copy.hint}</p>
    <p className="muted">{connected ? copy.next : copy.scope}</p>
    {!enabled ? <p className="issue warning">{copy.unavailable}</p> : null}
    <div className="hero-actions">
      <button type="button" className="button-primary" disabled={disabled || !enabled} onClick={connect}>{connected ? dictionary.channelManager.reconnectChannel : dictionary.channelManager.connectChannel}</button>
      {connected ? <button type="button" className="button-secondary" disabled={disabled} onClick={() => void disconnect()}>{dictionary.channelManager.disconnectChannel}</button> : null}
    </div>
    {connected ? <p className="field-hint">{copy.disconnect}</p> : null}
  </section>;
}
