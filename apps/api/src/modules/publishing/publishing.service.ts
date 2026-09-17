import { createHash } from "node:crypto";
import {
  channels,
  getBestCategoryLabel,
  getEffectiveProductForChannel,
  canPublishAssessment,
  type ChannelConnection,
  type ChannelId,
  type Product,
  type PublishJob,
  type PublishJobStatus,
  type PublishJobTarget,
  type PublishPreview
} from "@omnilist/shared";

import { PublishExecutionChangedError, type PublishJobRepository } from "./publishing.repository";
import { connectionRevision } from "./connection-revision";
import { assertConfirmedConnections } from "./publish-confirmation";
import { createEbayRecoveryService } from "./ebay-recovery.service";
import { validateProductAcrossChannels } from "../validation/validation.service";
import { UnifiedAssessmentService } from "../validation/assessment.service";
import type { ChannelConnectionRecord, ChannelConnectionRepository } from "../channels/channel-connections.repository";
import { createChannelPublishRegistry } from "./adapters/channel-publish-registry";
import type { ApiEnv } from "../../config/env";
import { withProductRevision } from "../catalog/product-revision";
import { ProductWriteError } from "../catalog/catalog.repository";
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
  targets: PublishJobTarget[],
  connectionRevisions: Record<string, string>,
  executionId: string,
  assertExecution: () => Promise<void>
): Promise<PublishJobTarget[]> {
  const registry = createChannelPublishRegistry(env);
  const assessments = new UnifiedAssessmentService(env, channelConnectionRepository);
  return Promise.all(targets.map(async (target) => {
    let remoteListing: PublishJobTarget["remoteListing"];
    let identity: ListingIdentity | undefined;
    let claimed = false;
    let revision = "";
    try {
      let record = target.connectionId
        ? await channelConnectionRepository.getConnectionRecordById(workspaceId, target.connectionId) : undefined;
      const connection = record?.connection;
      if (!record || !connection || connection.workspaceId !== workspaceId || connection.channelId !== target.channelId || connection.status !== "connected") {
        return { ...target, status: "failed", message: "Channel is not connected or requires reauthorization." };
      }
      if (connectionRevisions[target.id] !== connectionRevision(record, env.ebayEnvironment)) {
        return { ...target, status: "failed", message: "The connected account or its settings changed after confirmation. Check the product and publish again." };
      }
      const readiness = await assessments.assessProduct(product, target.channelId, record);
      if (!canPublishAssessment(readiness)) {
        return { ...target, status: "failed", readinessScore: readiness.score, issueCount: readiness.issues.length,
          message: readiness.issues.filter(issue => issue.severity === "blocking").map(issue => issue.message).join(" ") };
      }
      // Assessment may refresh credentials. Read them again before publishing.
      const refreshed = await channelConnectionRepository.getConnectionRecordById(workspaceId, connection.id);
      if (!refreshed || refreshed.connection.status !== "connected"
        || JSON.stringify(refreshed.connection) !== JSON.stringify(connection)
        || refreshed.credentials.refreshToken !== record.credentials.refreshToken) {
        return { ...target, status: "failed", message: "The connection changed during verification. Check the product again." };
      }
      record = refreshed;
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
        revision = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
        await assertExecution();
        const listing = await listings.claim(identity, revision, executionId);
        claimed = true;
        remoteListing = listing.remoteListing ?? undefined;
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
      const result = await registry.publish(product, target.channelId, record, remoteListing, identity ? {
        checkpoint: async checkpoint => {
          remoteListing = checkpoint.remoteListing ?? remoteListing;
          await assertExecution();
          await listings.recordCheckpoint(identity!, revision, checkpoint, executionId);
        }
      } : undefined);
      if (!result) return { ...target, status: "failed", message: "Publishing to this channel is not implemented yet. No listing was created." };
      remoteListing = result.remoteListing ?? remoteListing;
      if (identity) {
        await assertExecution();
        await listings.recordResult(identity, { ...result, revision, executionId });
        claimed = false;
      }
      let credentialWarning = "";
      if (result.updatedCredentials) {
        try { await channelConnectionRepository.setCredentialsForConnection(workspaceId, connection.id, record.credentials, result.updatedCredentials); }
        catch {
          // A token-storage error cannot undo a confirmed and persisted listing result.
          credentialWarning = " Connection credentials could not be saved; reauthorization may be needed before the next publish.";
          console.error("Could not persist refreshed channel credentials", { connectionId: connection.id });
        }
      }
      return { ...target, status: result.status, readinessScore: readiness.score, issueCount: readiness.issues.length,
        message: result.message + credentialWarning, connectionId: connection.id, remoteListing };
    } catch (error) {
      if (claimed && identity) {
        // No timed unlock: a lost response may already have created an offer at the provider.
        try {
          await assertExecution();
          await listings.recordResult(identity, { status: "failed", remoteListing, revision, executionId, requiresReconciliation: true });
        }
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

  async function recoverTargets(job: PublishJob, originalExecutionId: string): Promise<PublishJobTarget[]> {
    const stopped = await listings.interruptExecution(job.workspaceId, originalExecutionId);
    const recovery = createEbayRecoveryService(channelConnectionRepository, listings, env);
    return Promise.all(job.targets.map(async target => {
      const listing = stopped.find(item => item.productId === job.productId && item.connectionId === target.connectionId && item.channelId === target.channelId);
      let result: PublishJobTarget = { ...target, status: "failed",
        message: "This task stopped before sending a listing. Check the product and publish again." };
      if (!listing) return result;
      result = { ...result, remoteListing: listing.remoteListing ?? undefined,
        message: "The interrupted publication needs verification. Use Check eBay result on the product before retrying." };
      if (listing.status === "published" && listing.executionStage === "finished" && listing.remoteListing) {
        return { ...result, status: "published", message: "Recovered the saved eBay publication result." };
      }
      if (listing.status !== "needs_review") return result;
      if (listing.executionStage === "claimed") {
        await listings.markRetryable(listing, listing.remoteListing ?? undefined, listing);
        return { ...result, message: "The task stopped before any eBay write. Check the product and publish again." };
      }
      try {
        const outcome = await recovery.recoverListing(listing);
        return { ...result, status: outcome.status === "published" ? "published" : "failed",
          remoteListing: outcome.remoteListing ?? result.remoteListing,
          message: outcome.status === "published" ? `${outcome.message} Latest product changes are not confirmed; review the listing.` : outcome.message };
      } catch { return result; }
    }));
  }

  async function executeJob(workspaceId: string, jobId: string, recover = false) {
    const job = recover ? await repository.claimRecovery(workspaceId, jobId) : await repository.claimJob(workspaceId, jobId);
    if (!job?.executionId) return;
    const executionId = job.executionId;
    let lost = false;
    const assertExecution = async () => {
      if (lost || !await repository.renewExecution(workspaceId, jobId, executionId)) {
        lost = true;
        throw new PublishExecutionChangedError();
      }
    };
    let heartbeatPending = false;
    const heartbeat = setInterval(() => {
      if (heartbeatPending || lost) return;
      heartbeatPending = true;
      void assertExecution().catch(() => { lost = true; }).finally(() => { heartbeatPending = false; });
    }, 20_000);
    heartbeat.unref();
    try {
      let finalTargets: PublishJobTarget[];
      if ("recoveryOf" in job && typeof job.recoveryOf === "string") {
        finalTargets = await recoverTargets(job, job.recoveryOf);
      } else {
        const product = await repository.getJobProduct(workspaceId, jobId);
        const revisions = await repository.getConnectionRevisions(workspaceId, jobId);
        finalTargets = !product || !revisions
          ? job.targets.map(target => ({ ...target, status: "failed" as const,
            message: "The confirmed publication snapshot is unavailable. No request was sent. Check the product and publish again." }))
          : await processTargets(env, workspaceId, listings, repository, channelConnectionRepository,
            product, job.targets, revisions, executionId, assertExecution);
      }
      await assertExecution();
      await repository.updateJob(workspaceId, jobId, calculateFinalJobStatus(finalTargets), finalTargets, executionId);
    } catch (error) {
      if (lost || error instanceof PublishExecutionChangedError) return;
      // Storage failures leave the lease to expire; do not replace an ambiguous success with failure.
      console.error("Publish execution interrupted; recovery will verify its outcome", { jobId });
    } finally { clearInterval(heartbeat); }
  }

  let draining: Promise<void> | undefined;
  let stopped = false;
  let worker: ReturnType<typeof setInterval> | undefined;
  function resumePendingJobs() {
    if (stopped) return Promise.resolve();
    if (draining) return draining;
    draining = (async () => {
      for (const job of await repository.listRunnableJobs()) {
        if (stopped) break;
        await executeJob(job.workspaceId, job.id, job.status === "processing");
      }
    })().finally(() => { draining = undefined; });
    return draining;
  }

  return {
    resumePendingJobs,
    startWorker() {
      if (worker) return;
      stopped = false;
      const tick = () => { void resumePendingJobs().catch(() => console.error("Could not process publish queue")); };
      worker = setInterval(tick, 15_000);
      worker.unref();
      tick();
    },
    async stopWorker() {
      stopped = true;
      clearInterval(worker);
      worker = undefined;
      await draining;
    },
    buildPublishPreview,
    buildChannelDraft(product: Product, channelId: ChannelId, connection?: ChannelConnectionRecord) {
      return registry.buildDraft(product, channelId, connection);
    },
    async enqueuePublishJob(input: {
      workspaceId: string;
      product: Product;
      expectedRevision?: string;
      expectedConnectionRevisions?: Partial<Record<ChannelId, string>>;
      channelIds: ChannelId[];
      connections: ChannelConnection[];
      connectionRecords: ChannelConnectionRecord[];
    }) {
      input = { ...input, product: structuredClone(input.product) };
      if (input.expectedRevision && withProductRevision(input.product).revision !== input.expectedRevision) {
        throw new ProductWriteError("The product changed after preview. Reload it, check it again and confirm the new preview. Nothing was queued.");
      }
      if (input.expectedConnectionRevisions) {
        assertConfirmedConnections(input.workspaceId, input.channelIds, input.expectedConnectionRevisions,
          input.connectionRecords, env.ebayEnvironment);
      }
      const queuedTargets = toQueuedTargets(input.product, [...new Set(input.channelIds)]).map(target => ({
        ...target,
        connectionId: input.connectionRecords.find(record => record.connection.channelId === target.channelId)?.connection.id
      }));

      const job = await repository.createJob({
        workspaceId: input.workspaceId,
        productId: input.product.id,
        productTitle: input.product.title,
        productSnapshot: input.product,
        connectionRevisions: Object.fromEntries(queuedTargets.flatMap(target => {
          const record = input.connectionRecords.find(item => item.connection.id === target.connectionId);
          return record ? [[target.id, connectionRevision(record, env.ebayEnvironment)]] : [];
        })),
        status: "queued",
        targets: queuedTargets
      });

      void resumePendingJobs().catch(() => console.error("Could not process publish queue"));

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
