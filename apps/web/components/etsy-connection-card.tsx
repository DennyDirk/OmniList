"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { etsySetupOptionsSchema, type EtsySetupOptions, type ChannelConnection } from "@omnilist/shared";
import { dictionaries, formatConnectionStatus, type Locale } from "../lib/i18n";
import { etsyCopy, etsySetupError } from "../lib/etsy-copy";
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
  const generation = useRef(0);
  const [setup, setSetup] = useState<EtsySetupOptions>();
  const [setupError, setSetupError] = useState("");
  const [loadingSetup, setLoadingSetup] = useState(false);
  useEffect(() => {
    generation.current++;
    setSetup(undefined); setSetupError(""); setLoadingSetup(false); setBusy(false); lock.current = false;
    return () => { generation.current++; };
  }, [connection]);
  const connected = connection?.status === "connected";
  const disabled = busy || pending;
  async function loadSetup() {
    if (disabled || lock.current || !connection) return;
    lock.current = true; setBusy(true); setLoadingSetup(true); setSetup(undefined); setSetupError("");
    const requestGeneration = generation.current;
    try {
      const response = await fetch(`${apiBaseUrl}/channel-connections/etsy/setup-options`, {
        credentials: "include", cache: "no-store", signal: AbortSignal.timeout(45_000)
      });
      const body = await response.json().catch(() => undefined) as { item?: unknown; code?: string } | undefined;
      if (requestGeneration !== generation.current) return;
      if (!response.ok) { setSetupError(etsySetupError(locale, body?.code)); return; }
      const parsed = etsySetupOptionsSchema.safeParse(body?.item);
      if (!parsed.success || parsed.data.connectionId !== connection.id || parsed.data.shopId !== connection.externalAccountId) {
        setSetupError(copy.setupFailed); return;
      }
      setSetup(parsed.data);
    } catch {
      if (requestGeneration === generation.current) setSetupError(copy.setupFailed);
    } finally {
      if (requestGeneration === generation.current) { lock.current = false; setBusy(false); setLoadingSetup(false); }
    }
  }
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
    {connected ? <div className="listing-section">
      <h3>{copy.setupTitle}</h3><p className="field-hint">{copy.setupHint}</p>
      <button type="button" className="button-secondary" disabled={disabled || !enabled} onClick={() => void loadSetup()}>{loadingSetup ? copy.loadingSetup : copy.loadSetup}</button>
      {setupError ? <p className="issue blocking" role="alert">{setupError}</p> : null}
      {setup ? <div className="editor-grid">
        <section><h4>{copy.shipping}</h4>{setup.shippingProfiles.length ? <ul>{setup.shippingProfiles.map(p => <li key={p.id}>{p.title}</li>)}</ul> : <p className="issue warning">{copy.empty}</p>}</section>
        <section><h4>{copy.returns}</h4>{setup.returnPolicies.length ? <ul>{setup.returnPolicies.map(p => <li key={p.id}>{p.acceptsReturns ? copy.acceptsReturns : copy.noReturns}{p.returnDeadline !== null && (p.acceptsReturns || p.acceptsExchanges) ? ` (${p.returnDeadline} ${copy.days})` : ""}; {p.acceptsExchanges ? copy.exchanges : copy.noExchanges}</li>)}</ul> : <p className="issue warning">{copy.empty}</p>}</section>
        <section><h4>{copy.processing}</h4>{setup.processingProfiles.length ? <ul>{setup.processingProfiles.map(p => <li key={p.id}>{p.state === "made_to_order" ? copy.madeToOrder : copy.readyToShip}: {p.label}</li>)}</ul> : <p className="issue warning">{copy.empty}</p>}</section>
      </div> : null}
      <p><a className="text-link" href="https://www.etsy.com/your/shops/me/dashboard" target="_blank" rel="noopener noreferrer">{copy.shopManager}</a></p>
    </div> : null}
  </section>;
}
