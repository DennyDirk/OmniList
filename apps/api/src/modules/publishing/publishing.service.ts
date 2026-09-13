import { createHash } from "node:crypto";
import {
  channels,
  getBestCategoryLabel,
  getEffectiveProductForChannel,
  type ChannelConnection,
  type ChannelId,
  type Product,
  type PublishJob,
  type PublishJobStatus,
  type PublishJobTarget,
  type PublishPreview
} from "@omnilist/shared";

import type { PublishJobRepository } from "./publishing.repository";
import { validateProductAcrossChannels, validateProductForChannel } from "../validation/validation.service";
import type { ChannelConnectionRecord, ChannelConnectionRepository } from "../channels/channel-connections.repository";
import { createChannelPublishRegistry } from "./adapters/channel-publish-registry";
import type { ApiEnv } from "../../config/env";
import { createChannelListingRepository, ListingOwnershipError, type ChannelListingRepository, type ListingIdentity } from "./channel-listings.repository";

function buildChannelTitle(product: Product, channelId: ChannelId) {
  const effectiveProduct = getEffectiveProductForChannel(product, channelId);

  if (effectiveProduct.title !== product.title) {
    return effectiveProduct.title;
  }

  return product.title;
}

export function buildPublishPreview(product: Product, channelIds: ChannelId[]): PublishPreview {
  const readiness = validateProductAcrossChannels(product, channelIds);

  return {
    productId: product.id,
    items: readiness.map((entry) => {
      const channel = channels.find((item) => item.id === entry.channelId);
      const effectiveProduct = getEffectiveProductForChannel(product, entry.channelId);

      return {
        channelId: entry.channelId,
        channelName: channel?.name ?? entry.channelId,
        title: buildChannelTitle(product, entry.channelId),
        categoryLabel: getBestCategoryLabel(product, entry.channelId) ?? "Unmapped category",
        price: effectiveProduct.basePrice,
        readinessScore: entry.score,
        issueCount: entry.issues.length
      };
    })
  };
}

function calculateFinalJobStatus(targets: PublishJobTarget[]): PublishJobStatus {
  const publishedCount = targets.filter((item) => item.status === "published").length;
  const failedCount = targets.filter((item) => item.status === "failed").length;

  if (publishedCount === targets.length) {
    return "completed";
  }

  if (failedCount === targets.length) {
    return "failed";
  }

  return "partial";
}

function toQueuedTargets(product: Product, channelIds: ChannelId[]): PublishJobTarget[] {
  const preview = buildPublishPreview(product, channelIds);

  return preview.items.map((item) => ({
    id: crypto.randomUUID(),
    channelId: item.channelId,
    channelName: item.channelName,
    status: "queued",
    readinessScore: item.readinessScore,
    issueCount: item.issueCount
  }));
}

async function processTargets(
  env: ApiEnv,
  workspaceId: string,
  listings: ChannelListingRepository,
  jobs: PublishJobRepository,
  channelConnectionRepository: ChannelConnectionRepository,
  product: Product,
  targets: PublishJobTarget[]
): Promise<PublishJobTarget[]> {
  const registry = createChannelPublishRegistry(env);
  return Promise.all(targets.map(async (target) => {
    let remoteListing: PublishJobTarget["remoteListing"];
    let identity: ListingIdentity | undefined;
    let claimed = false;
    let revision = "";
    try {
      const readiness = validateProductForChannel(product, target.channelId);
      const record = target.connectionId
        ? await channelConnectionRepository.getConnectionRecordById(workspaceId, target.connectionId) : undefined;
      const connection = record?.connection;
      if (!record || !connection || connection.workspaceId !== workspaceId || connection.channelId !== target.channelId || connection.status !== "connected") {
        return { ...target, status: "failed", message: "Channel is not connected or requires reauthorization." };
      }
      if (readiness.status === "needs_attention") {
        return { ...target, status: "failed", readinessScore: readiness.score, issueCount: readiness.issues.length,
          message: readiness.issues.filter(issue => issue.severity === "blocking").map(issue => issue.message).join(" ") };
      }
      if (target.channelId === "ebay") {
        const draft = registry.buildDraft(product, target.channelId, record);
        const payload = draft?.payload as { offerPayload?: { sku?: string; marketplaceId?: string } } | undefined;
        if (draft?.missingConfiguration.length) return { ...target, status: "failed", message: draft.missingConfiguration[0] };
        if (!payload?.offerPayload?.sku || !payload.offerPayload.marketplaceId) {
          return { ...target, status: "failed", message: "The eBay listing identity could not be prepared. No listing was sent." };
        }
        identity = { workspaceId, productId: product.id, connectionId: connection.id, channelId: target.channelId,
          environment: env.ebayEnvironment, marketplaceId: payload.offerPayload.marketplaceId,
          sku: payload.offerPayload.sku, externalAccountId: connection.externalAccountId ?? "" };
        const listing = await listings.claim(identity);
        claimed = true;
        remoteListing = listing.remoteListing ?? undefined;
        revision = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
        if (!remoteListing) {
          // Historical IDs are only candidates: the adapter verifies them against eBay before writing.
          const history = await jobs.listJobs(workspaceId);
          const candidates = history.flatMap(job => job.targets.filter(t => t.connectionId === connection.id)
            .map(t => ({ productId: job.productId, remote: t.remoteListing })))
            .filter(item => item.remote?.channelId === "ebay" && item.remote.environment === identity!.environment &&
              item.remote.marketplaceId === identity!.marketplaceId && item.remote.sku === identity!.sku);
          if (candidates.some(item => item.productId !== product.id)) {
            throw new ListingOwnershipError("This SKU appears in another product's publishing history. Verify ownership before publishing.");
          }
          const offers = new Set(candidates.map(item => item.remote?.channelId === "ebay" ? item.remote.offerId : ""));
          if (offers.size > 1) throw new ListingOwnershipError("Multiple historical offers exist for this SKU. Verify the intended listing before publishing.");
          remoteListing = candidates[0]?.remote;
        }
      }
      const result = await registry.publish(product, target.channelId, record, remoteListing);
      if (!result) return { ...target, status: "failed", message: "Publishing to this channel is not implemented yet. No listing was created." };
      remoteListing = result.remoteListing ?? remoteListing;
      if (identity) {
        await listings.recordResult(identity, { ...result, revision });
        claimed = false;
      }
      if (result.updatedCredentials) {
        await channelConnectionRepository.setCredentialsForConnection(workspaceId, connection.id, record.credentials, result.updatedCredentials);
      }
      return { ...target, status: result.status, readinessScore: readiness.score, issueCount: readiness.issues.length,
        message: result.message, connectionId: connection.id, remoteListing };
    } catch (error) {
      if (claimed && identity) {
        // No timed unlock: a lost response may already have created an offer at the provider.
        try { await listings.recordResult(identity, { status: "failed", revision, requiresReconciliation: true }); }
        catch { /* A storage failure leaves the persisted claim locked for reconciliation. */ }
      }
      return { ...target, remoteListing, status: "failed", message: error instanceof ListingOwnershipError ? error.message
        : "Publishing could not be confirmed because a service request failed. Check the connected store before retrying." };
    }
  }));
}

export function createPublishingService(
  repository: PublishJobRepository,
  channelConnectionRepository: ChannelConnectionRepository,
  env: ApiEnv,
  listings: ChannelListingRepository = createChannelListingRepository()
) {
  const registry = createChannelPublishRegistry(env);

  return {
    buildPublishPreview,
    buildChannelDraft(product: Product, channelId: ChannelId, connection?: ChannelConnectionRecord) {
      return registry.buildDraft(product, channelId, connection);
    },
    async enqueuePublishJob(input: {
      workspaceId: string;
      product: Product;
      channelIds: ChannelId[];
      connections: ChannelConnection[];
      connectionRecords: ChannelConnectionRecord[];
    }) {
      const queuedTargets = toQueuedTargets(input.product, [...new Set(input.channelIds)]).map(target => ({
        ...target,
        connectionId: input.connectionRecords.find(record => record.connection.channelId === target.channelId)?.connection.id
      }));

      const job = await repository.createJob({
        workspaceId: input.workspaceId,
        productId: input.product.id,
        productTitle: input.product.title,
        status: "queued",
        targets: queuedTargets
      });

      void (async () => {
        const processingTargets = job.targets.map((target) => ({
          ...target,
          status: "processing" as const
        }));
        await repository.updateJob(input.workspaceId, job.id, "processing", processingTargets);

        const finalTargets = await processTargets(
          env,
          input.workspaceId,
          listings,
          repository,
          channelConnectionRepository,
          input.product,
          processingTargets
        );
        await repository.updateJob(
          input.workspaceId,
          job.id,
          calculateFinalJobStatus(finalTargets),
          finalTargets
        );
      })().catch(async () => {
        const targets = job.targets.map(target => ({
          ...target,
          status: "failed" as const,
          message: "The publishing task was interrupted. Check the connected store before retrying."
        }));
        await repository.updateJob(input.workspaceId, job.id, "failed", targets);
      }).catch(() => {
        console.error("Could not persist publish job outcome", { jobId: job.id });
      });

      return job;
    },
    listJobs(workspaceId: string, productId?: string) {
      return repository.listJobs(workspaceId, productId);
    },
    getJob(workspaceId: string, jobId: string): Promise<PublishJob | undefined> {
      return repository.getJob(workspaceId, jobId);
    }
  };
}
