"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Channel, ChannelConnection, ChannelConnectionCapability } from "@omnilist/shared";
import { dictionaries, formatConnectionStatus, type Locale } from "../lib/i18n";
import { publishCopy } from "../lib/publish-copy";
import { useFlash } from "./flash-provider";

interface Option { id: string; label: string; detail?: string }
interface SetupOptions {
  marketplaceId: string; merchantLocations: Option[]; fulfillmentPolicies: Option[];
  paymentPolicies: Option[]; returnPolicies: Option[]; warnings?: string[];
}
const setupFields = [
  { key: "merchantLocationKey", options: "merchantLocations" },
  { key: "fulfillmentPolicyId", options: "fulfillmentPolicies" },
  { key: "paymentPolicyId", options: "paymentPolicies" },
  { key: "returnPolicyId", options: "returnPolicies" }
] as const;
const labels = {
  en: ["Dispatch location", "Shipping policy", "Payment policy", "Return policy", "Choose a saved policy or location", "Manual IDs", "Saved selection", "Select..."],
  ru: ["Место отправки", "Правила доставки", "Правила оплаты", "Правила возврата", "Выберите сохранённые правила и место отправки", "Ввести ID вручную", "Сохранённый выбор", "Выберите..."],
  uk: ["Місце відправлення", "Правила доставки", "Правила оплати", "Правила повернення", "Оберіть збережені правила та місце відправлення", "Ввести ID вручну", "Збережений вибір", "Оберіть..."]
};

function initialMetadata(connection?: ChannelConnection) {
  return { marketplaceId: "EBAY_US", currency: "USD", ...connection?.metadata };
}

export function ChannelConnectionManager({ apiBaseUrl, capabilities, initialConnections, locale }: {
  apiBaseUrl: string; capabilities: ChannelConnectionCapability[]; channels: Channel[]; initialConnections: ChannelConnection[]; locale: Locale;
}) {
  const router = useRouter();
  const dictionary = dictionaries[locale];
  const text = publishCopy[locale];
  const names = labels[locale];
  const { showFlash } = useFlash();
  const connection = initialConnections.find(item => item.channelId === "ebay");
  const enabled = capabilities.find(item => item.channelId === "ebay")?.enabled;
  const [metadata, setMetadata] = useState<Record<string, string>>(() => initialMetadata(connection));
  const [options, setOptions] = useState<SetupOptions>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [isPending, startTransition] = useTransition();
  const lock = useRef(false);
  useEffect(() => { setMetadata(initialMetadata(connection)); setOptions(undefined); setError(""); }, [connection]);
  const connected = connection?.status === "connected";
  const complete = setupFields.every(field => metadata[field.key]?.trim());

  async function perform(action: "import" | "save" | "disconnect") {
    if (lock.current) return;
    lock.current = true;
    setBusy(action);
    setError("");
    try {
      const response = await fetch(apiBaseUrl + "/channel-connections/ebay" + (action === "import" ? "/setup-options?marketplaceId=" + encodeURIComponent(metadata.marketplaceId) : action === "disconnect" ? "/disconnect" : ""), {
        credentials: "include", method: action === "import" ? "GET" : action === "save" ? "PUT" : "POST",
        ...(action === "save" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: connection?.status, externalAccountId: connection?.externalAccountId, metadata }) } : {})
      });
      const body = await response.json().catch(() => undefined) as { item?: SetupOptions; message?: string } | undefined;
      if (!response.ok) throw new Error(body?.message || dictionary.channelManager.couldNotSave);
      if (action === "import") {
        if (!body?.item) throw new Error(dictionary.channelManager.couldNotLoadEbaySetup);
        const imported = body.item;
        setOptions(imported);
        setMetadata(current => {
          const updated = { ...current };
          for (const field of setupFields) {
            const choices = imported[field.options];
            // Multiple policies need an explicit seller choice, never an arbitrary first item.
            if (!current[field.key] && choices.length === 1) updated[field.key] = choices[0].id;
          }
          return updated;
        });
      } else {
        showFlash({ tone: "success", message: action === "save" ? dictionary.channelManager.savedConnection("eBay") : dictionary.channelManager.disconnectedChannel("eBay") });
        startTransition(() => router.refresh());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : dictionary.channelManager.couldNotSave);
    } finally {
      lock.current = false;
      setBusy("");
    }
  }

  const disabled = Boolean(busy) || isPending;
  function connect() { if (!disabled) { setBusy("connect"); window.location.assign(apiBaseUrl + "/channel-connections/ebay/connect/start"); } }
  return <div className="listing-connections">
    <section className="card">
      <div className="row"><h2>eBay</h2><span className={"pill " + (connected ? "ready" : "attention")}>{formatConnectionStatus(dictionary, connection?.status ?? "disconnected")}</span></div>
      <p>{connection?.externalAccountId || text.connect}</p>
      <p className="pill">{metadata.environment === "sandbox" ? text.sandbox : metadata.environment === "production" ? text.production : text.environmentUnknown} / {metadata.marketplaceId} / {metadata.currency}</p>
      {metadata.marketplaceId !== "EBAY_US" || metadata.currency !== "USD" ? <p className="issue blocking">{text.unsupportedMarket}</p> : null}
      {!connected ? <button type="button" className="button-primary" disabled={disabled || !enabled} onClick={connect}>{dictionary.channelManager.connectChannel}</button> : <>
        <p className="muted">{text.storeHint}</p>
        <details className="listing-section" open={!complete}>
          <summary>{text.store}{complete ? " / " + dictionary.statuses.connected : ""}</summary>
          <p className="field-hint">{names[4]}</p>
          <button type="button" className="button-secondary" disabled={disabled} onClick={() => void perform("import")}>{busy === "import" ? dictionary.channelManager.loadingEbaySetup : dictionary.channelManager.importFromEbay}</button>
          <fieldset disabled={disabled} className="listing-fieldset editor-grid">
            {setupFields.map((field, index) => {
              const choices = options?.[field.options] ?? [];
              const selected = metadata[field.key] || "";
              return <label className="field" key={field.key}><span>{names[index]}</span><select value={selected} onChange={event => setMetadata({ ...metadata, [field.key]: event.target.value })}>
                <option value="">{names[7]}</option>
                {selected && !choices.some(option => option.id === selected) ? <option value={selected}>{names[6]} ({selected})</option> : null}
                {choices.map(option => <option value={option.id} key={option.id}>{option.label}</option>)}
              </select>{choices.find(option => option.id === selected)?.detail ? <span className="field-hint">{choices.find(option => option.id === selected)?.detail}</span> : null}</label>;
            })}
          </fieldset>
          {options?.warnings?.length ? <div className="issue warning"><ul>{options.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div> : null}
          <details><summary>{names[5]}</summary><div className="editor-grid">{setupFields.map((field, index) => <label className="field" key={field.key}><span>{names[index]}</span><input disabled={disabled} value={metadata[field.key] || ""} onChange={event => setMetadata({ ...metadata, [field.key]: event.target.value })} /></label>)}</div></details>
          <button type="button" className="button-primary" disabled={disabled || !complete} onClick={() => void perform("save")}>{busy === "save" ? text.saving : dictionary.common.saveChannelSettings}</button>
        </details>
        <details className="listing-section"><summary>{text.advanced}</summary><p className="field-hint">{dictionary.channelManager.oauthBehaviorDescription}</p><div className="hero-actions">
          <button type="button" className="button-secondary" disabled={disabled || !enabled} onClick={connect}>{dictionary.channelManager.reconnectChannel}</button>
          <button type="button" className="button-secondary" disabled={disabled} onClick={() => void perform("disconnect")}>{dictionary.channelManager.disconnectChannel}</button>
        </div></details>
      </>}
      {error ? <p className="issue blocking" role="alert">{error}</p> : null}
    </section>
    <p className="muted">{text.comingSoon}</p>
  </div>;
}
