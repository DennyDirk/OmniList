import Link from "next/link";

import { ChannelConnectionManager } from "../../components/channel-connection-manager";
import { FlashOnMount } from "../../components/flash-on-mount";
import { requireAuthSession } from "../../lib/auth";
import { getChannelCapabilities, getChannelConnections, getChannels, getClientApiBaseUrl, getWorkspace } from "../../lib/api";
import { getI18n } from "../../lib/i18n.server";

function formatChannelActionMessage(
  dictionary: Awaited<ReturnType<typeof getI18n>>["dictionary"],
  channels: Array<{ id: string; name: string }>,
  searchParams?: Record<string, string | string[] | undefined>
) {
  const connected = typeof searchParams?.connected === "string" ? searchParams.connected : undefined;
  const disconnected = typeof searchParams?.disconnected === "string" ? searchParams.disconnected : undefined;
  const error = typeof searchParams?.error === "string" ? searchParams.error : undefined;
  const channelName = (channelId?: string) => channels.find((item) => item.id === channelId)?.name ?? channelId;

  if (connected) {
    return {
      kind: "success" as const,
      message: dictionary.channelManager.connectedChannel(channelName(connected) ?? connected)
    };
  }

  if (disconnected) {
    return {
      kind: "success" as const,
      message: dictionary.channelManager.disconnectedChannel(channelName(disconnected) ?? disconnected)
    };
  }

  if (error) {
    return {
      kind: "error" as const,
      message: dictionary.channelManager.oauthError(error)
    };
  }

  return undefined;
}

export default async function ChannelsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { dictionary, locale } = await getI18n();
  const session = await requireAuthSession();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const [workspace, channels, connections, capabilities] = await Promise.all([
    getWorkspace(),
    getChannels(),
    getChannelConnections(),
    getChannelCapabilities()
  ]);

  const connected = connections.filter((item) => item.status === "connected").length;
  const needsAttention = connections.filter((item) => item.status === "attention_required").length;
  const actionBanner = formatChannelActionMessage(dictionary, channels, resolvedSearchParams);

  return (
    <main className="shell">
      <section className="hero">
        <span className="eyebrow">{dictionary.channelsPage.eyebrow}</span>
        <h1>{dictionary.channelsPage.title}</h1>
        <p>{dictionary.channelsPage.description(workspace?.name ?? session.workspace.name)}</p>
        <div className="hero-actions">
          <span className="pill">{dictionary.channelsPage.connected(connected)}</span>
          <span className="pill attention">{dictionary.channelsPage.needsAttention(needsAttention)}</span>
          <Link className="cta secondary" href="/">
            {dictionary.common.backToDashboard}
          </Link>
        </div>
      </section>

      <section className="grid stats">
        <article className="card">
          <div className="stat-label">{dictionary.channelsPage.availableChannels}</div>
          <div className="stat-value">{channels.length}</div>
        </article>
        <article className="card">
          <div className="stat-label">{dictionary.channelsPage.connectedNow}</div>
          <div className="stat-value">{connected}</div>
        </article>
        <article className="card">
          <div className="stat-label">{dictionary.channelsPage.needAttention}</div>
          <div className="stat-value">{needsAttention}</div>
        </article>
      </section>

      <div className="section-title">
        <h2>{dictionary.channelsPage.manageConnections}</h2>
        <p>{dictionary.channelsPage.manageConnectionsDescription}</p>
      </div>

      {actionBanner ? (
        <FlashOnMount clearQueryKeys={["connected", "disconnected", "error"]} message={actionBanner.message} tone={actionBanner.kind} />
      ) : null}

      <ChannelConnectionManager
        apiBaseUrl={getClientApiBaseUrl()}
        capabilities={capabilities}
        channels={channels}
        initialConnections={connections}
        locale={locale}
      />
    </main>
  );
}
