import { and, eq } from "drizzle-orm";
import type { AuthProviderId, AuthSession, RegisterInput, User, Workspace, WorkspacePlan } from "@omnilist/shared";

import type { DbClient } from "../../db/client";
import { authSessionsTable, oauthIdentitiesTable, usersTable, workspacesTable } from "../../db/schema";

interface StoredUser extends User {
  passwordHash?: string;
}

interface StoredSession {
  token: string;
  userId: string;
}

interface Identity {
  provider: AuthProviderId;
  providerAccountId: string;
  userId: string;
}

interface OAuthIdentityInput {
  provider: AuthProviderId;
  providerAccountId: string;
  email: string;
  name: string;
}

export interface RegisterResult {
  sessionToken: string;
  session: AuthSession;
}

export interface AuthRepository {
  createUserWithSession(input: RegisterInput, passwordHash: string): Promise<RegisterResult>;
  createSessionForCredentials(email: string, passwordHash: string): Promise<RegisterResult | undefined>;
  getSession(token: string): Promise<AuthSession | undefined>;
  deleteSession(token: string): Promise<void>;
  getOrCreateUserFromOAuth(input: OAuthIdentityInput): Promise<RegisterResult>;
  getWorkspace(workspaceId: string): Promise<Workspace | undefined>;
  updateWorkspacePlan(workspaceId: string, subscriptionPlan: WorkspacePlan): Promise<Workspace | undefined>;
}

function createSessionResult(user: StoredUser, workspace: Workspace, sessionToken: string): RegisterResult {
  return {
    sessionToken,
    session: {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        workspaceId: user.workspaceId
      },
      workspace
    }
  };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function createMemoryAuthRepository(): AuthRepository {
  const usersById = new Map<string, StoredUser>();
  const usersByEmail = new Map<string, StoredUser>();
  const workspacesById = new Map<string, Workspace>();
  const sessionsByToken = new Map<string, StoredSession>();
  const identitiesByKey = new Map<string, Identity>();

  function createSession(user: StoredUser, workspace: Workspace): RegisterResult {
    const sessionToken = crypto.randomUUID();
    sessionsByToken.set(sessionToken, {
      token: sessionToken,
      userId: user.id
    });

    return createSessionResult(user, workspace, sessionToken);
  }

  return {
    async createUserWithSession(input, passwordHash) {
      const normalizedEmail = normalizeEmail(input.email);

      if (usersByEmail.has(normalizedEmail)) {
        throw new Error("EMAIL_TAKEN");
      }

      const workspace: Workspace = {
        id: crypto.randomUUID(),
        name: input.workspaceName?.trim() || `${input.name.trim()}'s Workspace`,
        subscriptionPlan: "free"
      };

      const user: StoredUser = {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        name: input.name.trim(),
        workspaceId: workspace.id,
        passwordHash
      };

      usersById.set(user.id, user);
      usersByEmail.set(user.email, user);
      workspacesById.set(workspace.id, workspace);

      return createSession(user, workspace);
    },
    async createSessionForCredentials(email, passwordHash) {
      const user = usersByEmail.get(normalizeEmail(email));

      if (!user || user.passwordHash !== passwordHash) {
        return undefined;
      }

      const workspace = workspacesById.get(user.workspaceId);
      if (!workspace) {
        return undefined;
      }

      return createSession(user, workspace);
    },
    async getSession(token) {
      const storedSession = sessionsByToken.get(token);
      if (!storedSession) {
        return undefined;
      }

      const user = usersById.get(storedSession.userId);
      if (!user) {
        return undefined;
      }

      const workspace = workspacesById.get(user.workspaceId);
      if (!workspace) {
        return undefined;
      }

      return createSessionResult(user, workspace, token).session;
    },
    async deleteSession(token) {
      sessionsByToken.delete(token);
    },
    async getOrCreateUserFromOAuth(input) {
      const key = `${input.provider}:${input.providerAccountId}`;
      const existingIdentity = identitiesByKey.get(key);

      if (existingIdentity) {
        const existingUser = usersById.get(existingIdentity.userId);
        const existingWorkspace = existingUser ? workspacesById.get(existingUser.workspaceId) : undefined;

        if (existingUser && existingWorkspace) {
          return createSession(existingUser, existingWorkspace);
        }
      }

      const normalizedEmail = normalizeEmail(input.email);
      let user = usersByEmail.get(normalizedEmail);

      if (!user) {
        const workspace: Workspace = {
          id: crypto.randomUUID(),
          name: `${input.name.trim()}'s Workspace`,
          subscriptionPlan: "free"
        };

        user = {
          id: crypto.randomUUID(),
          email: normalizedEmail,
          name: input.name.trim(),
          workspaceId: workspace.id
        };

        usersById.set(user.id, user);
        usersByEmail.set(user.email, user);
        workspacesById.set(workspace.id, workspace);
      }

      identitiesByKey.set(key, {
        provider: input.provider,
        providerAccountId: input.providerAccountId,
        userId: user.id
      });

      const workspace = workspacesById.get(user.workspaceId);
      if (!workspace) {
        throw new Error("WORKSPACE_NOT_FOUND");
      }

      return createSession(user, workspace);
    },
    async getWorkspace(workspaceId) {
      return workspacesById.get(workspaceId);
    },
    async updateWorkspacePlan(workspaceId, subscriptionPlan) {
      const workspace = workspacesById.get(workspaceId);

      if (!workspace) {
        return undefined;
      }

      const nextWorkspace = {
        ...workspace,
        subscriptionPlan
      };

      workspacesById.set(workspaceId, nextWorkspace);
      return nextWorkspace;
    }
  };
}

function toStoredUser(row: typeof usersTable.$inferSelect): StoredUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    workspaceId: row.workspaceId,
    passwordHash: row.passwordHash ?? undefined
  };
}

function toWorkspace(row: typeof workspacesTable.$inferSelect): Workspace {
  return {
    id: row.id,
    name: row.name,
    subscriptionPlan: row.subscriptionPlan as WorkspacePlan
  };
}

async function getUserWithWorkspace(db: DbClient, userId: string) {
  const rows = await db
    .select({
      user: usersTable,
      workspace: workspacesTable
    })
    .from(usersTable)
    .innerJoin(workspacesTable, eq(usersTable.workspaceId, workspacesTable.id))
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!rows[0]) {
    return undefined;
  }

  return {
    user: toStoredUser(rows[0].user),
    workspace: toWorkspace(rows[0].workspace)
  };
}

function createDbAuthRepository(db: DbClient): AuthRepository {
  return {
    async createUserWithSession(input, passwordHash) {
      const normalizedEmail = normalizeEmail(input.email);
      const existingUser = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);

      if (existingUser.length > 0) {
        throw new Error("EMAIL_TAKEN");
      }

      const workspaceId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const sessionToken = crypto.randomUUID();
      const workspaceName = input.workspaceName?.trim() || `${input.name.trim()}'s Workspace`;

      await db.transaction(async (tx) => {
        await tx.insert(workspacesTable).values({
          id: workspaceId,
          name: workspaceName,
          subscriptionPlan: "free"
        });

        await tx.insert(usersTable).values({
          id: userId,
          workspaceId,
          email: normalizedEmail,
          name: input.name.trim(),
          passwordHash
        });

        await tx.insert(authSessionsTable).values({
          token: sessionToken,
          userId
        });
      });

      return createSessionResult(
        {
          id: userId,
          email: normalizedEmail,
          name: input.name.trim(),
          workspaceId,
          passwordHash
        },
        {
          id: workspaceId,
          name: workspaceName,
          subscriptionPlan: "free"
        },
        sessionToken
      );
    },
    async createSessionForCredentials(email, passwordHash) {
      const normalizedEmail = normalizeEmail(email);
      const rows = await db
        .select({
          user: usersTable,
          workspace: workspacesTable
        })
        .from(usersTable)
        .innerJoin(workspacesTable, eq(usersTable.workspaceId, workspacesTable.id))
        .where(eq(usersTable.email, normalizedEmail))
        .limit(1);

      if (!rows[0]) {
        return undefined;
      }

      const user = toStoredUser(rows[0].user);
      const workspace = toWorkspace(rows[0].workspace);

      if (!user.passwordHash || user.passwordHash !== passwordHash) {
        return undefined;
      }

      const sessionToken = crypto.randomUUID();
      await db.insert(authSessionsTable).values({
        token: sessionToken,
        userId: user.id
      });

      return createSessionResult(user, workspace, sessionToken);
    },
    async getSession(token) {
      const rows = await db
        .select({
          session: authSessionsTable,
          user: usersTable,
          workspace: workspacesTable
        })
        .from(authSessionsTable)
        .innerJoin(usersTable, eq(authSessionsTable.userId, usersTable.id))
        .innerJoin(workspacesTable, eq(usersTable.workspaceId, workspacesTable.id))
        .where(eq(authSessionsTable.token, token))
        .limit(1);

      if (!rows[0]) {
        return undefined;
      }

      return createSessionResult(toStoredUser(rows[0].user), toWorkspace(rows[0].workspace), token).session;
    },
    async deleteSession(token) {
      await db.delete(authSessionsTable).where(eq(authSessionsTable.token, token));
    },
    async getOrCreateUserFromOAuth(input) {
      const normalizedEmail = normalizeEmail(input.email);
      const existingIdentity = await db
        .select()
        .from(oauthIdentitiesTable)
        .where(
          and(
            eq(oauthIdentitiesTable.provider, input.provider),
            eq(oauthIdentitiesTable.providerAccountId, input.providerAccountId)
          )
        )
        .limit(1);

      if (existingIdentity[0]) {
        const existingSessionUser = await getUserWithWorkspace(db, existingIdentity[0].userId);

        if (existingSessionUser) {
          const sessionToken = crypto.randomUUID();
          await db.insert(authSessionsTable).values({
            token: sessionToken,
            userId: existingSessionUser.user.id
          });

          return createSessionResult(existingSessionUser.user, existingSessionUser.workspace, sessionToken);
        }
      }

      const existingUserRows = await db
        .select({
          user: usersTable,
          workspace: workspacesTable
        })
        .from(usersTable)
        .innerJoin(workspacesTable, eq(usersTable.workspaceId, workspacesTable.id))
        .where(eq(usersTable.email, normalizedEmail))
        .limit(1);

      const existingUser = existingUserRows[0]
        ? {
            user: toStoredUser(existingUserRows[0].user),
            workspace: toWorkspace(existingUserRows[0].workspace)
          }
        : undefined;

      const sessionToken = crypto.randomUUID();

      if (existingUser) {
        await db.transaction(async (tx) => {
          await tx.insert(oauthIdentitiesTable).values({
            id: crypto.randomUUID(),
            provider: input.provider,
            providerAccountId: input.providerAccountId,
            userId: existingUser.user.id
          });

          await tx.insert(authSessionsTable).values({
            token: sessionToken,
            userId: existingUser.user.id
          });
        });

        return createSessionResult(existingUser.user, existingUser.workspace, sessionToken);
      }

      const workspaceId = crypto.randomUUID();
      const userId = crypto.randomUUID();
      const workspaceName = `${input.name.trim()}'s Workspace`;

      await db.transaction(async (tx) => {
        await tx.insert(workspacesTable).values({
          id: workspaceId,
          name: workspaceName,
          subscriptionPlan: "free"
        });

        await tx.insert(usersTable).values({
          id: userId,
          workspaceId,
          email: normalizedEmail,
          name: input.name.trim(),
          passwordHash: null
        });

        await tx.insert(oauthIdentitiesTable).values({
          id: crypto.randomUUID(),
          provider: input.provider,
          providerAccountId: input.providerAccountId,
          userId
        });

        await tx.insert(authSessionsTable).values({
          token: sessionToken,
          userId
        });
      });

      return createSessionResult(
        {
          id: userId,
          email: normalizedEmail,
          name: input.name.trim(),
          workspaceId
        },
        {
          id: workspaceId,
          name: workspaceName,
          subscriptionPlan: "free"
        },
        sessionToken
      );
    },
    async getWorkspace(workspaceId) {
      const rows = await db.select().from(workspacesTable).where(eq(workspacesTable.id, workspaceId)).limit(1);
      return rows[0] ? toWorkspace(rows[0]) : undefined;
    },
    async updateWorkspacePlan(workspaceId, subscriptionPlan) {
      const rows = await db
        .update(workspacesTable)
        .set({
          subscriptionPlan,
          updatedAt: new Date()
        })
        .where(eq(workspacesTable.id, workspaceId))
        .returning();

      return rows[0] ? toWorkspace(rows[0]) : undefined;
    }
  };
}

export function createAuthRepository(db?: DbClient): AuthRepository {
  if (!db) {
    return createMemoryAuthRepository();
  }

  return createDbAuthRepository(db);
}
