import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import type { AuthSession } from "@omnilist/shared";

import type { ApiEnv } from "../../config/env";
import type { DbClient } from "../../db/client";
import type { WorkspaceRepository } from "../workspace/workspace.repository";

function resolveUserName(user: SupabaseUser) {
  const metadataName = user.user_metadata?.name;
  if (typeof metadataName === "string" && metadataName.trim().length > 0) {
    return metadataName.trim();
  }

  const fallbackFromEmail = user.email?.split("@")[0]?.trim();
  if (fallbackFromEmail) {
    return fallbackFromEmail;
  }

  return "Seller";
}

function resolveWorkspaceName(user: SupabaseUser) {
  const metadataWorkspaceName = user.user_metadata?.workspaceName;
  if (typeof metadataWorkspaceName === "string" && metadataWorkspaceName.trim().length > 0) {
    return metadataWorkspaceName.trim();
  }

  return `${resolveUserName(user)}'s Workspace`;
}

export function extractAccessToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) {
    return undefined;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return undefined;
  }

  return token;
}

export function createAuthService(env: ApiEnv, workspaceRepository: WorkspaceRepository, db?: DbClient) {
  const supabase =
    env.supabaseUrl && env.supabaseServiceRoleKey
      ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        })
      : undefined;

  return {
    async getSession(accessToken: string | undefined): Promise<AuthSession | undefined> {
      if (!accessToken || !supabase) {
        return undefined;
      }

      const { data, error } = await supabase.auth.getUser(accessToken);

      if (error || !data.user || !data.user.email) {
        return undefined;
      }

      const user = data.user;
      const email = user.email;
      if (!email) {
        return undefined;
      }
      const workspace = db
        ? await workspaceRepository.ensureWorkspace(user.id, resolveWorkspaceName(user))
        : {
            id: user.id,
            name: resolveWorkspaceName(user),
            subscriptionPlan: "free" as const
          };

      return {
        user: {
          id: user.id,
          email,
          name: resolveUserName(user),
          workspaceId: workspace.id
        },
        workspace
      };
    },
    getWebRedirectUrl() {
      return env.publicWebUrl;
    }
  };
}
