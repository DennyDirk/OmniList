"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { ChannelConnection, ChannelId } from "@omnilist/shared";

import { dictionaries, formatConnectionStatus, type Locale } from "../lib/i18n";
import { useFlash } from "./flash-provider";

interface PublishProductCardProps {
  apiBaseUrl: string;
  productId: string;
  connections: ChannelConnection[];
  locale: Locale;
  blockingReasons?: Partial<Record<ChannelId, string>>;
}

export function PublishProductCard({
  apiBaseUrl,
  productId,
  connections,
  locale,
  blockingReasons = {}
}: PublishProductCardProps) {
  const router = useRouter();
  const dictionary = dictionaries[locale];
  const { showFlash } = useFlash();
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(
      connections.map((connection) => [
        connection.channelId,
        connection.status === "connected" && connection.channelId === "ebay" && !blockingReasons[connection.channelId]
      ])
    )
  );
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  const connectedChannels = connections.filter((connection) => connection.status === "connected");
  const selectableConnectedChannels = connectedChannels.filter((connection) => connection.channelId === "ebay" && !blockingReasons[connection.channelId]);

  async function handlePublish() {
    if (submitLock.current) return;
    if (!apiBaseUrl) {
      showFlash({
        tone: "error",
        message: dictionary.publishCard.missingApi
      });
      return;
    }

    const channelIds = selectableConnectedChannels
      .filter((connection) => selected[connection.channelId])
      .map((connection) => connection.channelId) as ChannelId[];

    if (channelIds.length === 0) {
      const firstBlockingChannel = connectedChannels.find((connection) => blockingReasons[connection.channelId]);
      const firstBlockingReason = firstBlockingChannel ? blockingReasons[firstBlockingChannel.channelId] : undefined;

      showFlash({
        tone: "error",
        message: firstBlockingReason ?? dictionary.publishCard.selectChannel
      });
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    try {
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
      showFlash({
        tone: "error",
        message: body?.message ?? dictionary.publishCard.enqueueFailed
      });
      return;
    }

    showFlash({
      tone: "success",
      message: dictionary.publishCard.enqueueSuccess
    });

    startTransition(() => {
      router.refresh();
    });

    } catch {
      showFlash({ tone: "error", message: dictionary.publishCard.enqueueFailed });
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
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
              disabled={connection.status !== "connected" || connection.channelId !== "ebay" || Boolean(blockingReasons[connection.channelId])}
              onChange={(event) =>
                setSelected((current) => ({
                  ...current,
                  [connection.channelId]: event.target.checked
                }))
              }
              type="checkbox"
            />
            <span>
              <div>
                {connection.channelId}{" "}
                {connection.channelId !== "ebay" ? "(coming soon) " : ""}
                {connection.status !== "connected" ? `(${formatConnectionStatus(dictionary, connection.status)})` : ""}
              </div>
              {blockingReasons[connection.channelId] ? (
                <div className="muted" style={{ marginTop: 4 }}>
                  {blockingReasons[connection.channelId]}
                </div>
              ) : null}
            </span>
          </label>
        ))}
      </div>

      <div className="editor-actions">
        <button className="button-primary" disabled={isPending || submitting} onClick={handlePublish} type="button">
          {isPending ? dictionary.common.refreshing : dictionary.publishCard.publishToSelected}
        </button>
      </div>
    </div>
  );
}
