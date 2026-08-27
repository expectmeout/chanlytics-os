/**
 * The single Realtime subscription wrapper (Blueprint §5): every surface
 * subscribes through here, so the documented scale path (postgres_changes →
 * broadcast-from-database) never touches a surface. RLS authorizes events —
 * and the session token is pushed to Realtime EXPLICITLY before the channel
 * joins: relying on supabase-js's auth-listener propagation races the join,
 * and a channel that joins as `anon` receives zero rows forever (observed in
 * production via realtime.subscription claims_role). Topic names are
 * caller-scoped: two subscriptions on one client must not share a topic.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export interface SubscribeOptions {
  /** Unique topic suffix per subscriber (default "bridge"). */
  topic?: string;
  /** Server-side row filter, e.g. a tenant id — RLS still applies regardless. */
  tenantId?: string;
  /** Observability: called with SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED. */
  onStatus?: (status: string) => void;
}

export function subscribeMessagesInserts(
  client: SupabaseClient<Database>,
  onInsert: (row: { conversation_id: string; tenant_id: string }) => void,
  opts: SubscribeOptions = {},
): () => void {
  const topic = `db-messages-inserts:${opts.topic ?? "bridge"}`;
  let removed = false;
  let channel: RealtimeChannel | null = null;

  void (async () => {
    // getSession reads local state (no network); the setAuth MUST land before
    // join or WALRUS registers the subscription with anon claims.
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (token) client.realtime.setAuth(token);
    if (removed) return;
    channel = client
      .channel(topic)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          ...(opts.tenantId ? { filter: `tenant_id=eq.${opts.tenantId}` } : {}),
        },
        (payload) => onInsert(payload.new as { conversation_id: string; tenant_id: string }),
      )
      .subscribe((status) => {
        if (opts.onStatus) opts.onStatus(status);
        else if (status !== "SUBSCRIBED") console.warn("realtime_status", topic, status);
      });
  })();

  return () => {
    removed = true;
    if (channel) void client.removeChannel(channel);
  };
}
