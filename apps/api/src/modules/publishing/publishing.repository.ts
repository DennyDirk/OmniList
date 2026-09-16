import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { productSchema, type Product, type PublishJob, type PublishJobStatus, type PublishJobTarget } from "@omnilist/shared";
import { withProductRevision } from "../catalog/product-revision";

import type { DbClient } from "../../db/client";
import { publishJobsTable, publishJobTargetsTable } from "../../db/schema";

interface CreatePublishJobInput {
  workspaceId: string;
  productId: string;
  productTitle: string;
  productSnapshot: Product;
  status: PublishJobStatus;
  targets: PublishJobTarget[];
}

export interface PublishJobRepository {
  createJob(input: CreatePublishJobInput): Promise<PublishJob>;
  listJobs(workspaceId: string, productId?: string): Promise<PublishJob[]>;
  listUnfinishedJobs(): Promise<PublishJob[]>;
  getJob(workspaceId: string, jobId: string): Promise<PublishJob | undefined>;
  getJobProduct(workspaceId: string, jobId: string): Promise<Product | undefined>;
  claimJob(workspaceId: string, jobId: string): Promise<PublishJob | undefined>;
  updateJob(workspaceId: string, jobId: string, status: PublishJobStatus, targets: PublishJobTarget[], executionId?: string): Promise<PublishJob | undefined>;
}

export class PublishExecutionChangedError extends Error {
  constructor() { super("The publish execution changed. Its result was not overwritten."); }
}

function toIsoString(date: Date | string) {
  return typeof date === "string" ? new Date(date).toISOString() : date.toISOString();
}

function prepareSnapshot(value: unknown, productId: string, title: string): Product {
  const parsed = productSchema.parse(value);
  const snapshot = withProductRevision(parsed);
  if (parsed.id !== productId || parsed.title !== title || (parsed.revision && parsed.revision !== snapshot.revision)) {
    throw new Error("The publish snapshot does not match the confirmed product.");
  }
  return snapshot;
}

function buildJob(
  job: typeof publishJobsTable.$inferSelect,
  targets: typeof publishJobTargetsTable.$inferSelect[]
): PublishJob {
  return {
    id: job.id,
    executionId: job.executionId ?? undefined,
    workspaceId: job.workspaceId,
    productId: job.productId,
    productTitle: job.productTitle,
    status: job.status as PublishJobStatus,
    createdAt: toIsoString(job.createdAt),
    updatedAt: toIsoString(job.updatedAt),
    targets: targets.map((target) => ({
      id: target.id,
      channelId: target.channelId as PublishJobTarget["channelId"],
      channelName: target.channelName,
      status: target.status as PublishJobTarget["status"],
      readinessScore: target.readinessScore,
      issueCount: target.issueCount,
      message: target.message ?? undefined,
      connectionId: target.connectionId ?? undefined,
      remoteListing: target.remoteListing ?? undefined
    }))
  };
}

function createMemoryPublishJobRepository(): PublishJobRepository {
  const jobsByWorkspace = new Map<string, Map<string, PublishJob>>();
  const snapshots = new Map<string, Product>();

  function getWorkspaceJobs(workspaceId: string) {
    const existing = jobsByWorkspace.get(workspaceId);
    if (existing) {
      return existing;
    }

    const created = new Map<string, PublishJob>();
    jobsByWorkspace.set(workspaceId, created);
    return created;
  }

  return {
    async createJob(input) {
      const snapshot = prepareSnapshot(input.productSnapshot, input.productId, input.productTitle);
      const now = new Date().toISOString();
      const job: PublishJob = {
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        productId: input.productId,
        productTitle: input.productTitle,
        status: input.status,
        createdAt: now,
        updatedAt: now,
        targets: structuredClone(input.targets)
      };

      getWorkspaceJobs(input.workspaceId).set(job.id, job);
      snapshots.set(job.id, snapshot);
      return structuredClone(job);
    },
    async listJobs(workspaceId, productId) {
      const items = [...getWorkspaceJobs(workspaceId).values()];
      const filtered = productId ? items.filter((item) => item.productId === productId) : items;
      return structuredClone(filtered.sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    },
    async listUnfinishedJobs() {
      return structuredClone([...jobsByWorkspace.values()].flatMap(jobs => [...jobs.values()])
        .filter(job => job.status === "queued" || job.status === "processing"));
    },
    async getJob(workspaceId, jobId) {
      return structuredClone(getWorkspaceJobs(workspaceId).get(jobId));
    },
    async getJobProduct(workspaceId, jobId) {
      if (!getWorkspaceJobs(workspaceId).has(jobId)) return undefined;
      return structuredClone(snapshots.get(jobId));
    },
    async claimJob(workspaceId, jobId) {
      const jobs = getWorkspaceJobs(workspaceId);
      const job = jobs.get(jobId);
      if (!job || job.status !== "queued") return undefined;
      const claimed: PublishJob = { ...job, executionId: crypto.randomUUID(), status: "processing", updatedAt: new Date().toISOString(),
        targets: job.targets.map(target => ({ ...target, status: "processing" })) };
      jobs.set(jobId, claimed);
      return structuredClone(claimed);
    },
    async updateJob(workspaceId, jobId, status, targets, executionId) {
      const jobs = getWorkspaceJobs(workspaceId);
      const existing = jobs.get(jobId);

      if (!existing) {
        return undefined;
      }

      if (existing.executionId !== executionId || (existing.executionId && existing.status !== "processing")) {
        throw new PublishExecutionChangedError();
      }
      const nextJob: PublishJob = {
        ...existing,
        status,
        updatedAt: new Date().toISOString(),
        targets: structuredClone(targets)
      };

      jobs.set(jobId, nextJob);
      return structuredClone(nextJob);
    }
  };
}

async function fetchTargetsByJobIds(db: DbClient, jobIds: string[]) {
  if (jobIds.length === 0) {
    return new Map<string, typeof publishJobTargetsTable.$inferSelect[]>();
  }

  const rows = await db
    .select()
    .from(publishJobTargetsTable)
    .where(inArray(publishJobTargetsTable.publishJobId, jobIds));

  const targetsByJobId = new Map<string, typeof publishJobTargetsTable.$inferSelect[]>();

  for (const row of rows) {
    const existing = targetsByJobId.get(row.publishJobId) ?? [];
    existing.push(row);
    targetsByJobId.set(row.publishJobId, existing);
  }

  return targetsByJobId;
}

function createDbPublishJobRepository(db: DbClient): PublishJobRepository {
  return {
    async createJob(input) {
      const snapshot = prepareSnapshot(input.productSnapshot, input.productId, input.productTitle);
      const jobId = crypto.randomUUID();
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx.insert(publishJobsTable).values({
          id: jobId,
          workspaceId: input.workspaceId,
          productId: input.productId,
          productTitle: input.productTitle,
          productSnapshot: snapshot,
          status: input.status,
          createdAt: now,
          updatedAt: now
        });

        await tx.insert(publishJobTargetsTable).values(
          input.targets.map((target) => ({
            id: target.id,
            publishJobId: jobId,
            channelId: target.channelId,
            channelName: target.channelName,
            status: target.status,
            readinessScore: target.readinessScore,
            issueCount: target.issueCount,
            message: target.message,
            connectionId: target.connectionId,
            remoteListing: target.remoteListing,
            createdAt: now,
            updatedAt: now
          }))
        );
      });

      return {
        id: jobId,
        workspaceId: input.workspaceId,
        productId: input.productId,
        productTitle: input.productTitle,
        status: input.status,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        targets: input.targets
      };
    },
    async listJobs(workspaceId, productId) {
      const rows = await db
        .select()
        .from(publishJobsTable)
        .where(
          productId
            ? and(eq(publishJobsTable.workspaceId, workspaceId), eq(publishJobsTable.productId, productId))
            : eq(publishJobsTable.workspaceId, workspaceId)
        )
        .orderBy(desc(publishJobsTable.createdAt));

      const targetsByJobId = await fetchTargetsByJobIds(
        db,
        rows.map((row) => row.id)
      );

      return rows.map((row) => buildJob(row, targetsByJobId.get(row.id) ?? []));
    },
    async listUnfinishedJobs() {
      const rows = await db.select().from(publishJobsTable)
        .where(inArray(publishJobsTable.status, ["queued", "processing"]))
        .orderBy(desc(publishJobsTable.createdAt));
      const targetsByJobId = await fetchTargetsByJobIds(db, rows.map(row => row.id));
      return rows.map(row => buildJob(row, targetsByJobId.get(row.id) ?? []));
    },
    async getJob(workspaceId, jobId) {
      const rows = await db
        .select()
        .from(publishJobsTable)
        .where(and(eq(publishJobsTable.workspaceId, workspaceId), eq(publishJobsTable.id, jobId)))
        .limit(1);

      if (!rows[0]) {
        return undefined;
      }

      const targetsByJobId = await fetchTargetsByJobIds(db, [jobId]);
      return buildJob(rows[0], targetsByJobId.get(jobId) ?? []);
    },
    async getJobProduct(workspaceId, jobId) {
      const [row] = await db.select({ productId: publishJobsTable.productId, title: publishJobsTable.productTitle,
        snapshot: publishJobsTable.productSnapshot }).from(publishJobsTable)
        .where(and(eq(publishJobsTable.workspaceId, workspaceId), eq(publishJobsTable.id, jobId))).limit(1);
      if (!row?.snapshot) return undefined;
      if (!row.snapshot.revision) throw new Error("The stored publish snapshot has no verified revision.");
      return prepareSnapshot(row.snapshot, row.productId, row.title);
    },
    async claimJob(workspaceId, jobId) {
      return db.transaction(async tx => {
        const now = new Date();
        const [job] = await tx.update(publishJobsTable).set({ status: "processing", executionId: crypto.randomUUID(), updatedAt: now })
          .where(and(eq(publishJobsTable.workspaceId, workspaceId), eq(publishJobsTable.id, jobId),
            eq(publishJobsTable.status, "queued"))).returning();
        if (!job) return undefined;
        const targets = await tx.update(publishJobTargetsTable).set({ status: "processing", updatedAt: now })
          .where(eq(publishJobTargetsTable.publishJobId, jobId)).returning();
        return buildJob(job, targets);
      });
    },
    async updateJob(workspaceId, jobId, status, targets, executionId) {
      const existing = await this.getJob(workspaceId, jobId);

      if (!existing) {
        return undefined;
      }

      const now = new Date();

      await db.transaction(async (tx) => {
        const updated = await tx
          .update(publishJobsTable)
          .set({
            status,
            updatedAt: now
          })
          .where(and(eq(publishJobsTable.workspaceId, workspaceId), eq(publishJobsTable.id, jobId),
            executionId ? and(eq(publishJobsTable.executionId, executionId), eq(publishJobsTable.status, "processing"))
              : isNull(publishJobsTable.executionId))).returning({ id: publishJobsTable.id });
        if (!updated.length) throw new PublishExecutionChangedError();

        for (const target of targets) {
          await tx
            .update(publishJobTargetsTable)
            .set({
              status: target.status,
              readinessScore: target.readinessScore,
              issueCount: target.issueCount,
              message: target.message,
              connectionId: target.connectionId ?? null,
              remoteListing: target.remoteListing ?? null,
              updatedAt: now
            })
            .where(and(eq(publishJobTargetsTable.publishJobId, jobId), eq(publishJobTargetsTable.id, target.id)));
        }
      });

      return {
        ...existing,
        status,
        updatedAt: now.toISOString(),
        targets
      };
    }
  };
}

export function createPublishJobRepository(db?: DbClient): PublishJobRepository {
  if (!db) {
    return createMemoryPublishJobRepository();
  }

  return createDbPublishJobRepository(db);
}
