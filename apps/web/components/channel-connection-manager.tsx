"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import type { Channel, ChannelConnection, ChannelConnectionCapability, ConnectionStatus } from "@omnilist/shared";

import { dictionaries, formatConnectionStatus, type Locale } from "../lib/i18n";

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
    condition: connection?.metadata.condition ?? "NEW"
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
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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

  async function saveConnection(channelId: Channel["id"]) {
    setError("");
    setSuccess("");

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
      setError(body?.message ?? dictionary.channelManager.couldNotSave);
      return;
    }

    setSuccess(dictionary.channelManager.savedConnection(channels.find((item) => item.id === channelId)?.name ?? channelId));

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="grid product-grid">
      {error ? <div className="banner error field-full">{error}</div> : null}
      {success ? <div className="banner success field-full">{success}</div> : null}

      {channelCards.map(({ channel, draft, capability }) => {
        const isSaving = isPending || savingChannelId === channel.id;
        const isOAuthChannel = capability?.connectionMode === "oauth";
        const canStartOAuth = Boolean(apiBaseUrl) && isOAuthChannel && capability?.enabled;
        const connectHref = `${apiBaseUrl}/channel-connections/${channel.id}/connect/start`;

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
                        <a className="cta secondary" href={connectHref}>
                          {draft.status === "connected" ? "Reconnect channel" : "Connect channel"}
                        </a>
                      ) : (
                        <span className="muted">OAuth connector is not configured on the server yet.</span>
                      )}
                    </div>

                    {channel.id === "ebay" ? (
                      <div className="connection-grid" style={{ marginTop: 16 }}>
                        <label className="field">
                          <span>Marketplace ID</span>
                          <input
                            value={draft.marketplaceId}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft(channel.id, "marketplaceId", event.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span>Merchant location key</span>
                          <input
                            value={draft.merchantLocationKey}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateDraft(channel.id, "merchantLocationKey", event.target.value)
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Fulfillment policy ID</span>
                          <input
                            value={draft.fulfillmentPolicyId}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateDraft(channel.id, "fulfillmentPolicyId", event.target.value)
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Payment policy ID</span>
                          <input
                            value={draft.paymentPolicyId}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateDraft(channel.id, "paymentPolicyId", event.target.value)
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Return policy ID</span>
                          <input
                            value={draft.returnPolicyId}
                            onChange={(event: ChangeEvent<HTMLInputElement>) =>
                              updateDraft(channel.id, "returnPolicyId", event.target.value)
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Currency</span>
                          <input
                            value={draft.currency}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft(channel.id, "currency", event.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span>Condition</span>
                          <input
                            value={draft.condition}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => updateDraft(channel.id, "condition", event.target.value)}
                          />
                        </label>
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
