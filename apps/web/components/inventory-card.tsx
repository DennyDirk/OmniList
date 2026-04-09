"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Product, ProductInventorySnapshot } from "@omnilist/shared";

import { formatDateTime, type Locale } from "../lib/i18n";
import { useFlash } from "./flash-provider";

interface InventoryCardProps {
  apiBaseUrl: string;
  locale: Locale;
  product: Product;
  snapshot?: ProductInventorySnapshot;
}

export function InventoryCard({ apiBaseUrl, locale, product, snapshot }: InventoryCardProps) {
  const router = useRouter();
  const { showFlash } = useFlash();
  const [isPending, startTransition] = useTransition();
  const [delta, setDelta] = useState("1");
  const [reason, setReason] = useState("");
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");

  const selectedVariant = useMemo(
    () => product.variants.find((item) => item.id === variantId),
    [product.variants, variantId]
  );

  async function handleAdjust(sign: 1 | -1) {
    const parsedDelta = Number(delta.trim());

    if (!Number.isInteger(parsedDelta) || parsedDelta <= 0) {
      showFlash({
        tone: "error",
        message: "Enter a positive whole number."
      });
      return;
    }

    const response = await fetch(`${apiBaseUrl}/products/${product.id}/inventory/adjust`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        variantId: product.variants.length > 0 ? variantId || undefined : undefined,
        delta: parsedDelta * sign,
        source: "manual",
        reason: reason.trim() || undefined
      })
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
      showFlash({
        tone: "error",
        message: body?.message ?? "Could not adjust inventory."
      });
      return;
    }

    showFlash({
      tone: "success",
      message: sign > 0 ? "Inventory increased." : "Inventory decreased."
    });
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <article className="card inventory-card">
      <div className="row">
        <h3>Inventory control</h3>
        <span className="pill">{snapshot?.totalQuantity ?? product.quantity} in stock</span>
      </div>

      <div className="list">
        {product.variants.length > 0 ? (
          <label className="field">
            <span>Variant</span>
            <select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
              {product.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.sku}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="inventory-adjust-row">
          <label className="field">
            <span>Adjustment</span>
            <input inputMode="numeric" value={delta} onChange={(event) => setDelta(event.target.value)} />
          </label>

          <label className="field field-full">
            <span>Reason</span>
            <input value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
        </div>

        <div className="hero-actions">
          <button className="button-primary" disabled={isPending} onClick={() => void handleAdjust(1)} type="button">
            Add stock
          </button>
          <button className="button-secondary" disabled={isPending} onClick={() => void handleAdjust(-1)} type="button">
            Remove stock
          </button>
        </div>

        {selectedVariant ? (
          <div className="list-item">
            <strong>{selectedVariant.sku}</strong>
            <div className="muted">{selectedVariant.quantity} units currently available</div>
          </div>
        ) : null}
      </div>

      <div className="bulk-section">
        <strong>Recent stock movements</strong>
        <div className="list compact-list">
          {snapshot?.recentMovements.length ? (
            snapshot.recentMovements.map((movement) => (
              <div className="list-item" key={movement.id}>
                <div className="row">
                  <strong>{movement.delta > 0 ? `+${movement.delta}` : movement.delta}</strong>
                  <span className="muted">{formatDateTime(movement.createdAt, locale)}</span>
                </div>
                <div className="muted">
                  {movement.variantId ? "Variant adjustment" : "Product adjustment"} • {movement.previousQuantity} to {movement.nextQuantity}
                </div>
                {movement.reason ? <div className="muted">{movement.reason}</div> : null}
              </div>
            ))
          ) : (
            <div className="list-item">No inventory movements yet.</div>
          )}
        </div>
      </div>
    </article>
  );
}
