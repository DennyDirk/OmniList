import { readinessResponseSchema, type ChannelConnection, type Product, type UnifiedAssessment } from "@omnilist/shared";

export class PublishReviewError extends Error {
  constructor(public reason: "stale" | "unavailable") { super(reason); }
}

function storeIdentity(connection: ChannelConnection) {
  return JSON.stringify([connection.id, connection.workspaceId, connection.channelId, connection.status,
    connection.externalAccountId, Object.entries(connection.metadata).sort(([a], [b]) => a.localeCompare(b))]);
}

export async function readPublishAssessment(apiBaseUrl: string, product: Product, connection: ChannelConnection,
  signal?: AbortSignal): Promise<UnifiedAssessment> {
  const response = await fetch(`${apiBaseUrl}/products/${encodeURIComponent(product.id)}/readiness?channels=${connection.channelId}`, {
    credentials: "include", cache: "no-store", signal
  });
  if (!response.ok) throw new PublishReviewError("unavailable");
  const parsed = readinessResponseSchema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success || parsed.data.productId !== product.id || parsed.data.items.length !== 1) {
    throw new PublishReviewError("unavailable");
  }
  if (!product.revision || parsed.data.productRevision !== product.revision) throw new PublishReviewError("stale");
  const checkedConnection = parsed.data.connections.find(item => item.id === connection.id);
  if (!checkedConnection || storeIdentity(checkedConnection) !== storeIdentity(connection)) throw new PublishReviewError("stale");
  const assessment = parsed.data.items[0];
  if (assessment.productId !== product.id || assessment.channelId !== connection.channelId
    || assessment.connectionId !== connection.id || !assessment.connectionRevision) throw new PublishReviewError("unavailable");
  if (signal?.aborted) throw new PublishReviewError("unavailable");
  return assessment;
}
