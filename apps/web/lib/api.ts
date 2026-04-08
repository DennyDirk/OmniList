import { cookies } from "next/headers";
import type {
  AuthProvider,
  AuthSession,
  Channel,
  ChannelConnection,
  ChannelConnectionCapability,
  ChannelDraftPreview,
  ProductInventorySnapshot,
  Product,
  PublishJob,
  Workspace,
  WorkspacePlan,
  WorkspaceUsage
} from "@omnilist/shared";

const apiBaseUrl = process.env.OMNILIST_API_URL ?? process.env.NEXT_PUBLIC_OMNILIST_API_URL ?? "http://localhost:4000";

async function buildCookieHeader() {
  const cookieStore = await cookies();
  return cookieStore
    .getAll()
    .map((item) => `${item.name}=${item.value}`)
    .join("; ");
}

async function requestJson<T>(path: string): Promise<{ status: number; data?: T }> {
  if (!apiBaseUrl) {
    return {
      status: 503
    };
  }

  const cookieHeader = await buildCookieHeader();

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      cache: "no-store",
      headers: cookieHeader
        ? {
            cookie: cookieHeader
          }
        : undefined
    });

    if (!response.ok) {
      return {
        status: response.status
      };
    }

    return {
      status: response.status,
      data: (await response.json()) as T
    };
  } catch {
    return {
      status: 503
    };
  }
}

export async function getAuthSession() {
  const response = await requestJson<{ item: AuthSession }>("/auth/session");
  return response.data?.item;
}

export async function getAuthProviders() {
  const response = await requestJson<{ items: AuthProvider[] }>("/auth/providers");
  return (
    response.data?.items ?? [
      { id: "google", name: "Google", enabled: false },
      { id: "facebook", name: "Facebook", enabled: false }
    ]
  );
}

export async function getProducts() {
  const response = await requestJson<{ items: Product[] }>("/products");
  return response.data?.items ?? [];
}

export async function getProduct(productId: string) {
  const response = await requestJson<{ item: Product }>(`/products/${productId}`);
  return response.data?.item;
}

export async function getChannels() {
  const response = await requestJson<{ items: Channel[] }>("/channels");
  return response.data?.items ?? [];
}

export async function getWorkspace() {
  const response = await requestJson<{ item: Workspace }>("/workspace");
  return response.data?.item;
}

export async function getWorkspaceUsage() {
  const response = await requestJson<{ item: WorkspaceUsage }>("/workspace/usage");
  return response.data?.item;
}

export async function getChannelConnections() {
  const response = await requestJson<{ items: ChannelConnection[] }>("/channel-connections");
  return response.data?.items ?? [];
}

export async function getChannelCapabilities() {
  const response = await requestJson<{ items: ChannelConnectionCapability[] }>("/channel-capabilities");
  return response.data?.items ?? [];
}

export async function getPublishJobs() {
  const response = await requestJson<{ items: PublishJob[] }>("/publish-jobs");
  return response.data?.items ?? [];
}

export async function getProductPublishJobs(productId: string) {
  const response = await requestJson<{ items: PublishJob[] }>(`/products/${productId}/publish-jobs`);
  return response.data?.items ?? [];
}

export async function getProductInventory(productId: string) {
  const response = await requestJson<{ item: ProductInventorySnapshot }>(`/products/${productId}/inventory`);
  return response.data?.item;
}

export async function getChannelDraftPreview(productId: string, channelId: string) {
  const response = await requestJson<{ item: ChannelDraftPreview }>(`/products/${productId}/channels/${channelId}/draft`);
  return response.data?.item;
}

export function getClientApiBaseUrl() {
  return process.env.NEXT_PUBLIC_OMNILIST_API_URL ?? process.env.OMNILIST_API_URL ?? "http://localhost:4000";
}

export async function updateWorkspacePlan(apiBaseUrl: string, subscriptionPlan: WorkspacePlan) {
  const response = await fetch(`${apiBaseUrl}/workspace/plan`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      subscriptionPlan
    })
  });

  return response;
}
