"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ChannelConnection, ChannelId } from "@omnilist/shared";

import { dictionaries, formatConnectionStatus, type Locale } from "../lib/i18n";

interface PublishProductCardProps {
  apiBaseUrl: string;
  productId: string;
  connections: ChannelConnection[];
  locale: Locale;
}

export function PublishProductCard({ apiBaseUrl, productId, connections, locale }: PublishProductCardProps) {
  const router = useRouter();
  const dictionary = dictionaries[locale];
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(connections.map((connection) => [connection.channelId, connection.status === "connected"]))
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const connectedChannels = connections.filter((connection) => connection.status === "connected");

  async function handlePublish() {
    setError("");

    if (!apiBaseUrl) {
      setError(dictionary.publishCard.missingApi);
      return;
    }

    const channelIds = connectedChannels
      .filter((connection) => selected[connection.channelId])
      .map((connection) => connection.channelId) as ChannelId[];

    if (channelIds.length === 0) {
      setError(dictionary.publishCard.selectChannel);
      return;
    }

    const response = await fetch(`${apiBaseUrl}/products/${productId}/publish`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        channels: channelIds
      })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
      setError(body?.message ?? dictionary.publishCard.enqueueFailed);
      return;
    }

    startTransition(() => {
      router.refresh();
    });

    setTimeout(() => {
      router.refresh();
    }, 2200);
  }

  return (
    <div className="card">
      <div className="row">
        <h3>{dictionary.publishCard.title}</h3>
        <span className="pill">{dictionary.publishCard.connected(connectedChannels.length)}</span>
      </div>
      <p className="muted">{dictionary.publishCard.description}</p>

      <div className="list">
        {connections.map((connection) => (
          <label className="list-item checkbox-row" key={connection.id}>
            <input
              checked={Boolean(selected[connection.channelId])}
              disabled={connection.status !== "connected"}
              onChange={(event) =>
                setSelected((current) => ({
                  ...current,
                  [connection.channelId]: event.target.checked
                }))
              }
              type="checkbox"
            />
            <span>
              {connection.channelId} {connection.status !== "connected" ? `(${formatConnectionStatus(dictionary, connection.status)})` : ""}
            </span>
          </label>
        ))}
      </div>

      {error ? <div className="banner error">{error}</div> : null}

      <div className="editor-actions">
        <button className="button-primary" disabled={isPending} onClick={handlePublish} type="button">
          {isPending ? dictionary.common.refreshing : dictionary.publishCard.publishToSelected}
        </button>
      </div>
    </div>
  );
}
