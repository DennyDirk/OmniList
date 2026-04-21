import { sql } from "drizzle-orm";
import type { Workspace, WorkspacePlan } from "@omnilist/shared";

import type { DbClient } from "../../db/client";

interface WorkspaceRow extends Record<string, unknown> {
  id: string;
  name: string;
  subscriptionPlan?: WorkspacePlan | null;
}

function isMissingSubscriptionPlanColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("subscription_plan");
}

function toWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    subscriptionPlan: row.subscriptionPlan ?? "free"
  };
}

async function selectWorkspaceWithPlan(db: DbClient, workspaceId: string) {
  const result = await db.execute<WorkspaceRow>(sql`
    select
      id,
      name,
      subscription_plan as "subscriptionPlan"
    from workspaces
    where id = ${workspaceId}
    limit 1
  `);

  return result.rows[0] ? toWorkspace(result.rows[0]) : undefined;
}

async function selectWorkspaceWithoutPlan(db: DbClient, workspaceId: string) {
  const result = await db.execute<WorkspaceRow>(sql`
    select
      id,
      name
    from workspaces
    where id = ${workspaceId}
    limit 1
  `);

  return result.rows[0] ? toWorkspace(result.rows[0]) : undefined;
}

async function insertWorkspaceWithPlan(db: DbClient, workspaceId: string, name: string) {
  await db.execute(sql`
    insert into workspaces (id, name, subscription_plan)
    values (${workspaceId}, ${name}, ${"free"})
    on conflict (id) do nothing
  `);
}

async function insertWorkspaceWithoutPlan(db: DbClient, workspaceId: string, name: string) {
  await db.execute(sql`
    insert into workspaces (id, name)
    values (${workspaceId}, ${name})
    on conflict (id) do nothing
  `);
}

export interface WorkspaceRepository {
  ensureWorkspace(workspaceId: string, name: string): Promise<Workspace>;
  getWorkspace(workspaceId: string): Promise<Workspace | undefined>;
  updateWorkspacePlan(workspaceId: string, subscriptionPlan: WorkspacePlan): Promise<Workspace | undefined>;
}

export function createWorkspaceRepository(db?: DbClient): WorkspaceRepository {
  if (!db) {
    return {
      async ensureWorkspace(workspaceId, name) {
        return {
          id: workspaceId,
          name,
          subscriptionPlan: "free"
        };
      },
      async getWorkspace() {
        return undefined;
      },
      async updateWorkspacePlan() {
        return undefined;
      }
    };
  }

  return {
    async ensureWorkspace(workspaceId, name) {
      const existing = await this.getWorkspace(workspaceId);
      if (existing) {
        return existing;
      }

      try {
        await insertWorkspaceWithPlan(db, workspaceId, name);
      } catch (error) {
        if (!isMissingSubscriptionPlanColumnError(error)) {
          throw error;
        }

        await insertWorkspaceWithoutPlan(db, workspaceId, name);
      }

      return (
        (await this.getWorkspace(workspaceId)) ?? {
          id: workspaceId,
          name,
          subscriptionPlan: "free"
        }
      );
    },
    async getWorkspace(workspaceId) {
      try {
        return await selectWorkspaceWithPlan(db, workspaceId);
      } catch (error) {
        if (!isMissingSubscriptionPlanColumnError(error)) {
          throw error;
        }

        return selectWorkspaceWithoutPlan(db, workspaceId);
      }
    },
    async updateWorkspacePlan(workspaceId, subscriptionPlan) {
      try {
        await db.execute(sql`
          update workspaces
          set subscription_plan = ${subscriptionPlan}
          where id = ${workspaceId}
        `);
      } catch (error) {
        if (!isMissingSubscriptionPlanColumnError(error)) {
          throw error;
        }
      }

      const workspace = await this.getWorkspace(workspaceId);

      if (!workspace) {
        return undefined;
      }

      return {
        ...workspace,
        subscriptionPlan: workspace.subscriptionPlan ?? subscriptionPlan
      };
    }
  };
}
