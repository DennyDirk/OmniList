import { createHash } from "node:crypto";
import type { Product } from "@omnilist/shared";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, canonical(item)]));
  return value;
}

export function withProductRevision(product: Product): Product {
  const { revision: _, ...data } = product;
  return { ...data, revision: createHash("sha256").update(JSON.stringify(canonical(data))).digest("hex") };
}
