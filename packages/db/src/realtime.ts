/**
 * The single Realtime subscription wrapper (Blueprint §5): every surface
 * subscribes through here, so the documented scale path (postgres_changes →
 * broadcast-from-database) never touches a surface. RLS authorizes events —
 * callers pass an AUTHED client. Topic names are caller-scoped: two
 * subscriptions on one client MUST NOT share a topic (realtime-js throws on
 * .on() after subscribe for an existing topic).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
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
  const channel = client
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
  return () => {
    void client.removeChannel(channel);
  };
}
