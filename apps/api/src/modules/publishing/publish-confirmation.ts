import type { ChannelId, Product } from "@omnilist/shared";
import type { ChannelConnectionRecord } from "../channels/channel-connections.repository";
import { ProductWriteError } from "../catalog/catalog.repository";
import { withProductRevision } from "../catalog/product-revision";
import { connectionRevision } from "./connection-revision";

export function assertConfirmedProduct(product: Product | undefined, expectedRevision: string): asserts product is Product {
  if (!product || withProductRevision(product).revision !== expectedRevision) {
    throw new ProductWriteError("A product changed or is no longer available. Reload, check again and confirm a new preview. Nothing was queued.");
  }
}

export function assertConfirmedConnections(workspaceId: string, channelIds: ChannelId[],
  expected: Partial<Record<ChannelId, string>>, records: ChannelConnectionRecord[], environment: string) {
  for (const channelId of channelIds) {
    const record = records.find(item => item.connection.channelId === channelId);
    if (!record || record.connection.workspaceId !== workspaceId || record.connection.status !== "connected"
      || expected[channelId] !== connectionRevision(record, environment)) {
      throw new ProductWriteError("The store or its settings changed after preview. Reload, check again and confirm a new preview. Nothing was queued.");
    }
  }
}

// Resolve and validate the entire selection before enqueueing its first snapshot.
export async function confirmBulkProducts(selections: { productId: string; productRevision: string }[],
  load: (id: string) => Promise<Product | undefined>): Promise<Product[]> {
  const products: Product[] = [];
  for (const selection of selections) {
    const product = await load(selection.productId);
    assertConfirmedProduct(product, selection.productRevision);
    products.push(structuredClone(product));
  }
  return products;
}
