"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ChangeEvent } from "react";
import type { Channel, ChannelConnection, ChannelConnectionCapability, ConnectionStatus } from "@omnilist/shared";

import { dictionaries, formatConnectionStatus, type Locale } from "../lib/i18n";
import { useFlash } from "./flash-provider";

interface ChannelConnectionManagerProps {
  apiBaseUrl: string;
  capabilities: ChannelConnectionCapability[];
  channels: Channel[];
  initialConnections: ChannelConnection[];
  locale: Locale;
}

interface ChannelConnectionDraft {
  id?: string;
  channelId: Channel["id"];
  status: ConnectionStatus;
  externalAccountId: string;
  syncMode: string;
  note: string;
  marketplaceId: string;
  merchantLocationKey: string;
  fulfillmentPolicyId: string;
  paymentPolicyId: string;
  returnPolicyId: string;
  currency: string;
  condition: string;
  authMode: string;
  connectedAt: string;
  environment: string;
}

interface EbaySetupOption {
  id: string;
  label: string;
  detail?: string;
}

interface EbaySetupOptions {
  marketplaceId: string;
  merchantLocations: EbaySetupOption[];
  fulfillmentPolicies: EbaySetupOption[];
  paymentPolicies: EbaySetupOption[];
  returnPolicies: EbaySetupOption[];
  warnings?: string[];
}

function buildDraft(channel: Channel, connection?: ChannelConnection): ChannelConnectionDraft {
  return {
    id: connection?.id,
    channelId: channel.id,
    status: connection?.status ?? "disconnected",
    externalAccountId: connection?.externalAccountId ?? "",
    syncMode: connection?.metadata.sync ?? "",
    note: connection?.metadata.note ?? connection?.metadata.reason ?? "",
    marketplaceId: connection?.metadata.marketplaceId ?? "EBAY_US",
    merchantLocationKey: connection?.metadata.merchantLocationKey ?? "",
    fulfillmentPolicyId: connection?.metadata.fulfillmentPolicyId ?? "",
    paymentPolicyId: connection?.metadata.paymentPolicyId ?? "",
    returnPolicyId: connection?.metadata.returnPolicyId ?? "",
    currency: connection?.metadata.currency ?? "USD",
    condition: connection?.metadata.condition ?? "NEW",
    authMode: connection?.metadata.authMode ?? "",
    connectedAt: connection?.metadata.connectedAt ?? "",
    environment: connection?.metadata.environment ?? ""
  };
}

function getSuggestedSync(channelId: Channel["id"]) {
  if (channelId === "shopify") {
    return "catalog_and_inventory";
  }

  if (channelId === "ebay") {
    return "listing_and_inventory";
  }

  return "listing_only";
}

export function ChannelConnectionManager({
  apiBaseUrl,
  capabilities,
  channels,
  initialConnections,
  locale
}: ChannelConnectionManagerProps) {
  const router = useRouter();
  const dictionary = dictionaries[locale];
  const { showFlash } = useFlash();
  const [isPending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, ChannelConnectionDraft>>(() =>
    Object.fromEntries(
      channels.map((channel) => {
        const connection = initialConnections.find((item) => item.channelId === channel.id);
        return [channel.id, buildDraft(channel, connection)];
      })
    )
  );
  const [savingChannelId, setSavingChannelId] = useState<string | null>(null);
  const [oauthChannelBusyId, setOauthChannelBusyId] = useState<string | null>(null);
  const [loadingSetupChannelId, setLoadingSetupChannelId] = useState<string | null>(null);
  const [ebaySetupOptions, setEbaySetupOptions] = useState<EbaySetupOptions | null>(null);

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        channels.map((channel) => {
          const connection = initialConnections.find((item) => item.channelId === channel.id);
          return [channel.id, buildDraft(channel, connection)];
        })
      )
    );
  }, [channels, initialConnections]);

  const channelCards = useMemo(
    () =>
      channels.map((channel) => ({
        channel,
        draft: drafts[channel.id] ?? buildDraft(channel),
        capability: capabilities.find((item) => item.channelId === channel.id)
      })),
    [capabilities, channels, drafts]
  );

  function updateDraft(channelId: string, key: keyof ChannelConnectionDraft, value: string) {
    setDrafts((current) => ({
      ...current,
      [channelId]: {
        ...current[channelId],
        [key]: value
      }
    }));
  }

  function getEbaySetupIssues(draft: ChannelConnectionDraft) {
    const issues: string[] = [];

    if (draft.status !== "connected") {
      issues.push(dictionary.channelManager.connectAccountFirst);
    }

    if (!draft.merchantLocationKey.trim()) {
      issues.push(dictionary.channelManager.missingMerchantLocationKey);
    }

    if (!draft.fulfillmentPolicyId.trim()) {
      issues.push(dictionary.channelManager.missingFulfillmentPolicyId);
    }

    if (!draft.paymentPolicyId.trim()) {
      issues.push(dictionary.channelManager.missingPaymentPolicyId);
    }

    if (!draft.returnPolicyId.trim()) {
      issues.push(dictionary.channelManager.missingReturnPolicyId);
    }

    return issues;
  }

  function applySetupValue(channelId: string, key: keyof ChannelConnectionDraft, value: string) {
    updateDraft(channelId, key, value);
  }

  async function loadEbaySetupOptions() {
    const draft = drafts.ebay;

    if (!draft) {
      return;
    }

    setLoadingSetupChannelId("ebay");

    const response = await fetch(
      `${apiBaseUrl}/channel-connections/ebay/setup-options?marketplaceId=${encodeURIComponent(draft.marketplaceId || "EBAY_US")}`,
      {
        credentials: "include"
      }
    );

    setLoadingSetupChannelId(null);

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
      showFlash({
        tone: "error",
        message: body?.message ?? dictionary.channelManager.couldNotLoadEbaySetup
      });
      return;
    }

    const body = (await response.json()) as { item: EbaySetupOptions };
    const nextOptions = body.item;
    setEbaySetupOptions(nextOptions);
    setDrafts((current) => ({
      ...current,
      ebay: {
        ...current.ebay,
        marketplaceId: current.ebay.marketplaceId || nextOptions.marketplaceId,
        merchantLocationKey: current.ebay.merchantLocationKey || nextOptions.merchantLocations[0]?.id || "",
        fulfillmentPolicyId: current.ebay.fulfillmentPolicyId || nextOptions.fulfillmentPolicies[0]?.id || "",
        paymentPolicyId: current.ebay.paymentPolicyId || nextOptions.paymentPolicies[0]?.id || "",
        returnPolicyId: current.ebay.returnPolicyId || nextOptions.returnPolicies[0]?.id || ""
      }
    }));

    showFlash({
      tone: "success",
      message: dictionary.channelManager.loadedEbaySetup
    });

    for (const warning of nextOptions.warnings ?? []) {
      showFlash({
        tone: "info",
        message: warning
      });
    }
  }

  async function saveConnection(channelId: Channel["id"]) {
    const draft = drafts[channelId];

    if (!draft) {
      return;
    }

    setSavingChannelId(channelId);

    const response = await fetch(`${apiBaseUrl}/channel-connections/${channelId}`, {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: draft.status,
        externalAccountId: draft.externalAccountId.trim() || undefined,
        metadata: Object.fromEntries(
          Object.entries({
            sync: draft.syncMode.trim(),
            note: draft.note.trim(),
            marketplaceId: draft.marketplaceId.trim(),
            merchantLocationKey: draft.merchantLocationKey.trim(),
            fulfillmentPolicyId: draft.fulfillmentPolicyId.trim(),
            paymentPolicyId: draft.paymentPolicyId.trim(),
            returnPolicyId: draft.returnPolicyId.trim(),
            currency: draft.currency.trim(),
            condition: draft.condition.trim()
          }).filter(([, value]) => value.length > 0)
        )
      })
    });

    setSavingChannelId(null);

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
      showFlash({
        tone: "error",
        message: body?.message ?? dictionary.channelManager.couldNotSave
      });
      return;
    }

    showFlash({
      tone: "success",
      message: dictionary.channelManager.savedConnection(channels.find((item) => item.id === channelId)?.name ?? channelId)
    });

    startTransition(() => {
      router.refresh();
    });
  }

  function startOAuthConnection(channelId: Channel["id"]) {
    setOauthChannelBusyId(channelId);
    window.location.assign(`${apiBaseUrl}/channel-connections/${channelId}/connect/start`);
  }

  async function disconnectOAuthChannel(channelId: Channel["id"]) {
    setOauthChannelBusyId(channelId);

    const response = await fetch(`${apiBaseUrl}/channel-connections/${channelId}/disconnect`, {
      method: "POST",
      credentials: "include"
    });

    setOauthChannelBusyId(null);

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
      showFlash({
        tone: "error",
        message: body?.message ?? dictionary.channelManager.couldNotDisconnect
      });
      return;
    }

    showFlash({
      tone: "success",
      message: dictionary.channelManager.disconnectedChannel(channels.find((item) => item.id === channelId)?.name ?? channelId)
    });

    if (channelId === "ebay") {
      setEbaySetupOptions(null);
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid product-grid">
      {channelCards.map(({ channel, draft, capability }) => {
        const isSaving = isPending || savingChannelId === channel.id;
        const isOAuthBusy = oauthChannelBusyId === channel.id;
        const isLoadingSetup = loadingSetupChannelId === channel.id;
        const isOAuthChannel = capability?.connectionMode === "oauth";
        const canStartOAuth = Boolean(apiBaseUrl) && isOAuthChannel && capability?.enabled;
        const ebaySetupIssues = channel.id === "ebay" ? getEbaySetupIssues(draft) : [];

        return (
          <article className="card" key={channel.id}>
            <div className="row">
              <h3>{channel.name}</h3>
              <span
                className={`pill ${
                  draft.status === "connected" ? "ready" : draft.status === "attention_required" ? "attention" : ""
                }`}
              >
                {formatConnectionStatus(dictionary, draft.status)}
              </span>
            </div>

            <p className="muted">{dictionary.channels.descriptions[channel.id]}</p>

            <div className="list">
              <div className="list-item">
                <div className="connection-grid">
                  <label className="field">
                    <span>{dictionary.channelManager.status}</span>
                    <select
                      disabled={isOAuthChannel}
                      value={draft.status}
                      onChange={(event) =>
                        updateDraft(channel.id, "status", event.target.value as ChannelConnectionDraft["status"])
                      }
                    >
                      <option value="disconnected">{dictionary.statuses.disconnected}</option>
                      <option value="connected">{dictionary.statuses.connected}</option>
                      <option value="attention_required">{dictionary.statuses.attentionRequired}</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>{dictionary.channelManager.externalAccountId}</span>
                    <input
                      disabled={isOAuthChannel}
                      placeholder={channel.id === "shopify" ? "store-name" : "seller-account-id"}
                      value={draft.externalAccountId}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        updateDraft(channel.id, "externalAccountId", event.target.value)
                      }
                    />
                  </label>

                  <label className="field">
                    <span>{dictionary.channelManager.syncMode}</span>
                    <input
                      placeholder={getSuggestedSync(channel.id)}
                      value={draft.syncMode}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft(channel.id, "syncMode", event.target.value)}
                    />
                    <span className="field-hint">{dictionary.channelManager.syncModeHint}</span>
                  </label>

                  <label className="field field-full">
                    <span>{dictionary.channelManager.internalNote}</span>
                    <textarea
                      placeholder={dictionary.channelManager.notePlaceholder}
                      rows={3}
                      value={draft.note}
                      onChange={(event: ChangeEvent<HTMLTextAreaElement>) => updateDraft(channel.id, "note", event.target.value)}
                    />
                  </label>
                </div>
              </div>

              <div className="list-item">
                <div className="row">
                  <strong>{dictionary.channelManager.connectionGuidance}</strong>
                  <span className="pill">{dictionary.channels.kindLabels[channel.kind]}</span>
                </div>
                <div className="muted">{dictionary.channelManager.region}: {channel.region}</div>
                <div className="muted">{dictionary.channelManager.guidanceDescription}</div>
                {isOAuthChannel ? (
                  <>
                    <div className="hero-actions" style={{ marginTop: 16 }}>
                      {canStartOAuth ? (
                        <>
                          <button
                            className="button-secondary"
                            disabled={isOAuthBusy}
                            onClick={() => startOAuthConnection(channel.id)}
                            type="button"
                          >
                            {isOAuthBusy
                              ? dictionary.channelManager.redirectingToProvider
                              : draft.status === "connected"
                                ? dictionary.channelManager.reconnectChannel
                                : dictionary.channelManager.connectChannel}
                          </button>
                          {draft.status === "connected" ? (
                            <button
                              className="button-secondary"
                              disabled={isOAuthBusy}
                              onClick={() => void disconnectOAuthChannel(channel.id)}
                              type="button"
                            >
                              {dictionary.channelManager.disconnectChannel}
                            </button>
                          ) : null}
                        </>
                      ) : (
                        <span className="muted">{dictionary.channelManager.oauthNotConfigured}</span>
                      )}
                    </div>

                    <div className="list" style={{ marginTop: 16 }}>
                      <div className="list-item">
                        <strong>{dictionary.channelManager.linkedAccount}</strong>
                        <div className="muted" style={{ marginTop: 8 }}>
                          {draft.externalAccountId || dictionary.channelManager.noLinkedAccountYet}
                        </div>
                      </div>

                      {draft.connectedAt ? (
                        <div className="list-item">
                          <strong>{dictionary.channelManager.connectedAt}</strong>
                          <div className="muted" style={{ marginTop: 8 }}>
                            {new Date(draft.connectedAt).toLocaleString()}
                          </div>
                        </div>
                      ) : null}

                      <div className="list-item">
                        <strong>{dictionary.channelManager.oauthBehaviorTitle}</strong>
                        <div className="muted" style={{ marginTop: 8 }}>
                          {dictionary.channelManager.oauthBehaviorDescription}
                        </div>
                      </div>
                    </div>

                    {channel.id === "ebay" ? (
                      <div className="connection-grid" style={{ marginTop: 16 }}>
                        <div className="field field-full">
                          <div className="row">
                            <span>{dictionary.channelManager.importSellerSetupTitle}</span>
                            <button
                              className="button-secondary"
                              disabled={draft.status !== "connected" || isLoadingSetup}
                              onClick={() => void loadEbaySetupOptions()}
                              type="button"
                            >
                              {isLoadingSetup ? dictionary.channelManager.loadingEbaySetup : dictionary.channelManager.importFromEbay}
                            </button>
                          </div>
                          <span className="field-hint">{dictionary.channelManager.importSellerSetupHint}</span>
                        </div>
                        <label className="field">
                          <span>{dictionary.channelManager.marketplaceId}</span>
                          <input
                            value={draft.marketplaceId}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft(channel.id, "marketplaceId", event.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span>{dictionary.channelManager.merchantLocationKey}</span>
                          <input
                            value={draft.merchantLocationKey}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateDraft(channel.id, "merchantLocationKey", event.target.value)
                            }
                          />
                          {ebaySetupOptions?.merchantLocations.length ? (
                            <div className="option-chips">
                              {ebaySetupOptions.merchantLocations.map((option) => (
                                <button
                                  className={`option-chip ${draft.merchantLocationKey === option.id ? "selected" : ""}`}
                                  key={option.id}
                                  onClick={() => applySetupValue(channel.id, "merchantLocationKey", option.id)}
                                  type="button"
                                >
                                  <span>{option.label}</span>
                                  <small>{option.detail ?? option.id}</small>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </label>
                        <label className="field">
                          <span>{dictionary.channelManager.fulfillmentPolicyId}</span>
                          <input
                            value={draft.fulfillmentPolicyId}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateDraft(channel.id, "fulfillmentPolicyId", event.target.value)
                            }
                          />
                          {ebaySetupOptions?.fulfillmentPolicies.length ? (
                            <div className="option-chips">
                              {ebaySetupOptions.fulfillmentPolicies.map((option) => (
                                <button
                                  className={`option-chip ${draft.fulfillmentPolicyId === option.id ? "selected" : ""}`}
                                  key={option.id}
                                  onClick={() => applySetupValue(channel.id, "fulfillmentPolicyId", option.id)}
                                  type="button"
                                >
                                  <span>{option.label}</span>
                                  <small>{option.detail ?? option.id}</small>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </label>
                        <label className="field">
                          <span>{dictionary.channelManager.paymentPolicyId}</span>
                          <input
                            value={draft.paymentPolicyId}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateDraft(channel.id, "paymentPolicyId", event.target.value)
                            }
                          />
                          {ebaySetupOptions?.paymentPolicies.length ? (
                            <div className="option-chips">
                              {ebaySetupOptions.paymentPolicies.map((option) => (
                                <button
                                  className={`option-chip ${draft.paymentPolicyId === option.id ? "selected" : ""}`}
                                  key={option.id}
                                  onClick={() => applySetupValue(channel.id, "paymentPolicyId", option.id)}
                                  type="button"
                                >
                                  <span>{option.label}</span>
                                  <small>{option.detail ?? option.id}</small>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </label>
                        <label className="field">
                          <span>{dictionary.channelManager.returnPolicyId}</span>
                          <input
                            value={draft.returnPolicyId}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateDraft(channel.id, "returnPolicyId", event.target.value)
                            }
                          />
                          {ebaySetupOptions?.returnPolicies.length ? (
                            <div className="option-chips">
                              {ebaySetupOptions.returnPolicies.map((option) => (
                                <button
                                  className={`option-chip ${draft.returnPolicyId === option.id ? "selected" : ""}`}
                                  key={option.id}
                                  onClick={() => applySetupValue(channel.id, "returnPolicyId", option.id)}
                                  type="button"
                                >
                                  <span>{option.label}</span>
                                  <small>{option.detail ?? option.id}</small>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </label>
                        <label className="field">
                          <span>{dictionary.channelManager.currency}</span>
                          <input
                            value={draft.currency}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft(channel.id, "currency", event.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span>{dictionary.channelManager.condition}</span>
                          <input
                            value={draft.condition}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft(channel.id, "condition", event.target.value)}
                          />
                        </label>

                        <div className="field field-full">
                          <span>{dictionary.channelManager.publishReadinessTitle}</span>
                          <div className="list">
                            {ebaySetupIssues.length === 0 ? (
                              <div className="issue suggestion">{dictionary.channelManager.publishReadyNow}</div>
                            ) : (
                              ebaySetupIssues.map((issue) => (
                                <div className="issue warning" key={issue}>
                                  {issue}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>

            <button className="button-primary" disabled={isSaving} onClick={() => void saveConnection(channel.id)} type="button">
              {isSaving ? dictionary.common.saving : dictionary.common.saveChannelSettings}
            </button>
          </article>
        );
      })}
    </div>
  );
}
