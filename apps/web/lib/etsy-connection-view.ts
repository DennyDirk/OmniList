import type { ChannelConnection } from "@omnilist/shared";

// Connection availability is not publishing readiness.
export function etsyConnectionView(enabled: boolean, status?: ChannelConnection["status"]) {
  const connected = status === "connected";
  return {
    badge: !enabled ? (connected ? "unavailable" : "upcoming")
      : connected ? "connected" : status === "attention_required" ? "attention_required" : "preview",
    canConnect: enabled,
    canDisconnect: connected,
    canReadSetup: enabled && connected
    
  } as const;
}
