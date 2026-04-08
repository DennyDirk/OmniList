"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { ChannelConnection, ChannelId, Product } from "@omnilist/shared";

import { getReadinessForAllChannels } from "../lib/readiness";
import { dictionaries, type Locale } from "../lib/i18n";

interface BulkPublishCardProps {
  apiBaseUrl: string;
  products: Product[];
  connections: ChannelConnection[];
  locale: Locale;
}

export function BulkPublishCard({ apiBaseUrl, products, connections, locale }: BulkPublishCardProps) {
  const router = useRouter();
  const dictionary = dictionaries[locale];
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});
  const [selectedChannels, setSelectedChannels] = useState<Record<string, boolean>>(
    Object.fromEntries(connections.filter((item) => item.status === "connected").map((item) => [item.channelId, true]))
  );

  const connectedChannels = connections.filter((item) => item.status === "connected");
  const productRows = useMemo(
    () =>
      products.map((product) => {
        const readiness = getReadinessForAllChannels(product);
        const readyConnectedCount = readiness.filter(
          (entry) =>
            entry.readiness.status === "ready" &&
            connectedChannels.some((connection) => connection.channelId === entry.channel.id)
        ).length;

        return {
          product,
          readyConnectedCount
        };
      }),
    [connectedChannels, products]
  );

  async function handleQueue() {
    setError("");
    setSuccess("");

    const productIds = Object.entries(selectedProducts)
      .filter(([, value]) => value)
      .map(([productId]) => productId);

    const channels = Object.entries(selectedChannels)
      .filter(([, value]) => value)
      .map(([channelId]) => channelId) as ChannelId[];

    if (!apiBaseUrl) {
      setError("Run the API before using bulk publish.");
      return;
    }

    if (productIds.length === 0) {
      setError("Select at least one product.");
      return;
    }

    if (channels.length === 0) {
      setError("Select at least one connected channel.");
      return;
    }

    const response = await fetch(`${apiBaseUrl}/publish-jobs/bulk`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        productIds,
        channels
      })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
      setError(body?.message ?? "Could not queue bulk publish jobs.");
      return;
    }

    const body = (await response.json()) as {
      queuedCount: number;
      skipped: Array<{ productId: string; reason: string }>;
    };

    setSuccess(
      body.skipped.length > 0
        ? `Queued ${body.queuedCount} jobs. Skipped ${body.skipped.length} products that were unavailable.`
        : `Queued ${body.queuedCount} publish jobs.`
    );

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <article className="card bulk-card">
      <div className="row">
        <h3>Bulk publish</h3>
        <span className="pill">{connectedChannels.length} connected channels</span>
      </div>
      <p className="muted">
        Queue multiple products into the publish pipeline at once. This is the fastest path to the core OmniList workflow.
      </p>

      <div className="bulk-section">
        <strong>Channels</strong>
        <div className="list compact-list">
          {connections.map((connection) => (
            <label className="list-item checkbox-row" key={connection.id}>
              <input
                checked={Boolean(selectedChannels[connection.channelId])}
                disabled={connection.status !== "connected"}
                onChange={(event) =>
                  setSelectedChannels((current) => ({
                    ...current,
                    [connection.channelId]: event.target.checked
                  }))
                }
                type="checkbox"
              />
              <span>
                {connection.channelId}
                {connection.status !== "connected" ? ` (${connection.status})` : ""}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="bulk-section">
        <div className="row">
          <strong>Products</strong>
          <button
            className="button-secondary"
            onClick={() =>
              setSelectedProducts(
                Object.fromEntries(productRows.filter((row) => row.readyConnectedCount > 0).map((row) => [row.product.id, true]))
              )
            }
            type="button"
          >
            Select ready
          </button>
        </div>
        <div className="list compact-list">
          {productRows.length === 0 ? (
            <div className="list-item">{dictionary.dashboard.workspaceReadyDescription}</div>
          ) : (
            productRows.map((row) => (
              <label className="list-item checkbox-row" key={row.product.id}>
                <input
                  checked={Boolean(selectedProducts[row.product.id])}
                  onChange={(event) =>
                    setSelectedProducts((current) => ({
                      ...current,
                      [row.product.id]: event.target.checked
                    }))
                  }
                  type="checkbox"
                />
                <div className="bulk-product-meta">
                  <strong>{row.product.title}</strong>
                  <span className="muted">
                    {row.readyConnectedCount} ready connected channels • {row.product.sku}
                  </span>
                </div>
              </label>
            ))
          )}
        </div>
      </div>

      {error ? <div className="banner error">{error}</div> : null}
      {success ? <div className="banner success">{success}</div> : null}

      <div className="editor-actions">
        <button className="button-primary" disabled={isPending} onClick={() => void handleQueue()} type="button">
          {isPending ? dictionary.common.refreshing : "Queue selected products"}
        </button>
      </div>
    </article>
  );
}
