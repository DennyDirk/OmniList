import Link from "next/link";
import { ChannelConnectionManager } from "../../components/channel-connection-manager";
import { FlashOnMount } from "../../components/flash-on-mount";
import { requireAuthSession } from "../../lib/auth";
import { getChannelCapabilities, getChannelConnections, getChannels, getClientApiBaseUrl } from "../../lib/api";
import { getI18n } from "../../lib/i18n.server";
import { publishCopy } from "../../lib/publish-copy";

export default async function ChannelsPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { dictionary, locale } = await getI18n();
  await requireAuthSession();
  const query = await searchParams;
  const [channels, connections, capabilities] = await Promise.all([getChannels(), getChannelConnections(), getChannelCapabilities()]);
  const channelName = (id: string) => channels.find(channel => channel.id === id)?.name || id;
  const error = typeof query?.error === "string" ? query.error : undefined;
  const connected = typeof query?.connected === "string" ? query.connected : undefined;
  const disconnected = typeof query?.disconnected === "string" ? query.disconnected : undefined;
  const message = error ? dictionary.channelManager.oauthError(error)
    : connected ? dictionary.channelManager.connectedChannel(channelName(connected))
    : disconnected ? dictionary.channelManager.disconnectedChannel(channelName(disconnected)) : undefined;
  return <main className="shell listing-shell">
    <header className="listing-header"><Link className="text-link" href="/">{publishCopy[locale].catalog}</Link><h1>eBay</h1></header>
    {message ? <FlashOnMount clearQueryKeys={["connected", "disconnected", "error"]} message={message} tone={error ? "error" : "success"} /> : null}
    <ChannelConnectionManager apiBaseUrl={getClientApiBaseUrl()} capabilities={capabilities} channels={channels} initialConnections={connections} locale={locale} />
  </main>;
}
