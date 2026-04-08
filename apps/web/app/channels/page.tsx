import Link from "next/link";

import { ChannelConnectionManager } from "../../components/channel-connection-manager";
import { requireAuthSession } from "../../lib/auth";
import { getChannelCapabilities, getChannelConnections, getChannels, getClientApiBaseUrl, getWorkspace } from "../../lib/api";
import { getI18n } from "../../lib/i18n.server";

export default async function ChannelsPage() {
  const { dictionary, locale } = await getI18n();
  const session = await requireAuthSession();
  const [workspace, channels, connections, capabilities] = await Promise.all([
    getWorkspace(),
    getChannels(),
    getChannelConnections(),
    getChannelCapabilities()
  ]);

  const connected = connections.filter((item) => item.status === "connected").length;
  const needsAttention = connections.filter((item) => item.status === "attention_required").length;

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
