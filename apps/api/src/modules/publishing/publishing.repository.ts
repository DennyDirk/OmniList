import { and, desc, eq, inArray } from "drizzle-orm";
import type { PublishJob, PublishJobStatus, PublishJobTarget } from "@omnilist/shared";

import type { DbClient } from "../../db/client";
import { publishJobsTable, publishJobTargetsTable } from "../../db/schema";

interface CreatePublishJobInput {
  workspaceId: string;
  productId: string;
  productTitle: string;
  status: PublishJobStatus;
  targets: PublishJobTarget[];
}

export interface PublishJobRepository {
  createJob(input: CreatePublishJobInput): Promise<PublishJob>;
  listJobs(workspaceId: string, productId?: string): Promise<PublishJob[]>;
  getJob(workspaceId: string, jobId: string): Promise<PublishJob | undefined>;
  updateJob(workspaceId: string, jobId: string, status: PublishJobStatus, targets: PublishJobTarget[]): Promise<PublishJob | undefined>;
}

function toIsoString(date: Date | string) {
  return typeof date === "string" ? new Date(date).toISOString() : date.toISOString();
}

function buildJob(
  job: typeof publishJobsTable.$inferSelect,
  targets: typeof publishJobTargetsTable.$inferSelect[]
): PublishJob {
  return {
    id: job.id,
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
      message: target.message ?? undefined
    }))
  };
}

function createMemoryPublishJobRepository(): PublishJobRepository {
  const jobsByWorkspace = new Map<string, Map<string, PublishJob>>();

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
      const now = new Date().toISOString();
      const job: PublishJob = {
        id: crypto.randomUUID(),
        workspaceId: input.workspaceId,
        productId: input.productId,
        productTitle: input.productTitle,
        status: input.status,
        createdAt: now,
        updatedAt: now,
        targets: input.targets
      };

      getWorkspaceJobs(input.workspaceId).set(job.id, job);
      return job;
    },
    async listJobs(workspaceId, productId) {
      const items = [...getWorkspaceJobs(workspaceId).values()];
      const filtered = productId ? items.filter((item) => item.productId === productId) : items;
      return filtered.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    async getJob(workspaceId, jobId) {
      return getWorkspaceJobs(workspaceId).get(jobId);
    },
    async updateJob(workspaceId, jobId, status, targets) {
      const jobs = getWorkspaceJobs(workspaceId);
      const existing = jobs.get(jobId);

      if (!existing) {
        return undefined;
      }

      const nextJob: PublishJob = {
        ...existing,
        status,
        updatedAt: new Date().toISOString(),
        targets
      };

      jobs.set(jobId, nextJob);
      return nextJob;
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
      const jobId = crypto.randomUUID();
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx.insert(publishJobsTable).values({
          id: jobId,
          workspaceId: input.workspaceId,
          productId: input.productId,
          productTitle: input.productTitle,
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
    async updateJob(workspaceId, jobId, status, targets) {
      const existing = await this.getJob(workspaceId, jobId);

      if (!existing) {
        return undefined;
      }

      const now = new Date();

      await db.transaction(async (tx) => {
        await tx
          .update(publishJobsTable)
          .set({
            status,
            updatedAt: now
          })
          .where(and(eq(publishJobsTable.workspaceId, workspaceId), eq(publishJobsTable.id, jobId)));

        for (const target of targets) {
          await tx
            .update(publishJobTargetsTable)
            .set({
              status: target.status,
              readinessScore: target.readinessScore,
              issueCount: target.issueCount,
              message: target.message,
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
