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

function buildChannelTitle(product: Product, channelId: ChannelId) {
  const effectiveProduct = getEffectiveProductForChannel(product, channelId);

  if (effectiveProduct.title !== product.title) {
    return effectiveProduct.title;
  }

  if (channelId === "etsy") {
    return `${product.title} | Handmade Style`;
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
  channelConnectionRepository: ChannelConnectionRepository,
  product: Product,
  connectionRecords: ChannelConnectionRecord[],
  targets: PublishJobTarget[]
): Promise<PublishJobTarget[]> {
  const connectionsByChannel = new Map(connectionRecords.map((item) => [item.connection.channelId, item]));
  const registry = createChannelPublishRegistry(env);

  return Promise.all(targets.map(async (target) => {
    try {
    const readiness = validateProductForChannel(product, target.channelId);
    const connectionRecord = connectionsByChannel.get(target.channelId);
    const connection = connectionRecord?.connection;

    if (!connection || connection.status !== "connected") {
      return {
        ...target,
        status: "failed",
        readinessScore: readiness.score,
        issueCount: readiness.issues.length,
        message: "Channel is not connected or requires reauthorization."
      };
    }

    if (readiness.status === "needs_attention") {
      return {
        ...target,
        status: "failed",
        readinessScore: readiness.score,
        issueCount: readiness.issues.length,
        message: readiness.issues.filter(issue => issue.severity === "blocking").map(issue => issue.message).join(" ")
      };
    }

    const adapterResult = connectionRecord ? await registry.publish(product, target.channelId, connectionRecord) : undefined;

    if (adapterResult) {
      if (adapterResult.updatedCredentials) {
        await channelConnectionRepository.setCredentials(
          connection.workspaceId,
          target.channelId,
          adapterResult.updatedCredentials
        );
      }

      return {
        ...target,
        status: adapterResult.status,
        readinessScore: readiness.score,
        issueCount: readiness.issues.length,
        message: adapterResult.message
      };
    }

    return {
      ...target,
      status: "failed",
      readinessScore: readiness.score,
      issueCount: readiness.issues.length,
        message: "Publishing to this channel is not implemented yet. No listing was created."
      };
    } catch {
      return { ...target, status: "failed", message: "Publishing could not be confirmed because a service request failed. Check eBay for this SKU before retrying." };
    }
  }));
}

export function createPublishingService(
  repository: PublishJobRepository,
  channelConnectionRepository: ChannelConnectionRepository,
  env: ApiEnv
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
      const queuedTargets = toQueuedTargets(input.product, [...new Set(input.channelIds)]);

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
          channelConnectionRepository,
          input.product,
          input.connectionRecords,
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
          message: "The publishing task was interrupted. Check the listing on eBay before retrying."
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
