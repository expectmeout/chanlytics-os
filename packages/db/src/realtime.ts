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

/** Tables whose changes must repaint the live surfaces (Blueprint §5). */
const WATCHED: Array<{ table: string; event: "INSERT" | "*" }> = [
  { table: "messages", event: "INSERT" },
  { table: "conversations", event: "*" },   // pause_expire, snooze_wake, other tabs
  { table: "escalations", event: "*" },     // opened by the edge, resolved elsewhere
  { table: "calls", event: "*" },           // a call starting, each live turn, its end, its analysis
  { table: "notifications", event: "INSERT" }, // an alert the edge kept: the bell repaints
  { table: "lines", event: "*" },           // a line's saga step, its failure, its answer: Setup repaints
  { table: "google_listings", event: "*" }, // the listing linked, read, or removed: Setup and Reports repaint
  { table: "google_reviews", event: "INSERT" }, // a review seen for the first time
  { table: "billing_accounts", event: "*" }, // Stripe's answer, applied by the webhook: Billing and Setup repaint
];

export function subscribeMessagesInserts(
  client: SupabaseClient<Database>,
  /** Called with the changed row and the TABLE it came from, so a caller can
   *  route the event instead of repainting everything on every change. */
  onInsert: (row: { conversation_id: string; tenant_id: string }, table: string, event?: string) => void,
  opts: SubscribeOptions = {},
): () => void {
  const topic = `db-changes:${opts.topic ?? "bridge"}`;
  let removed = false;
  let channel: RealtimeChannel | null = null;

  void (async () => {
    // getSession reads local state (no network); the setAuth MUST land before
    // join or WALRUS registers the subscription with anon claims.
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (token) client.realtime.setAuth(token);
    if (removed) return;
    channel = client.channel(topic);
    for (const w of WATCHED) {
      channel = channel.on(
        "postgres_changes",
        {
          event: w.event,
          schema: "public",
          table: w.table,
          ...(opts.tenantId ? { filter: `tenant_id=eq.${opts.tenantId}` } : {}),
        },
        // The event too: a surface may want a call STARTING and ENDING and
        // not the transcript turn every few seconds in between.
        (payload) => onInsert((payload.new ?? payload.old ?? {}) as { conversation_id: string; tenant_id: string }, w.table, payload.eventType),
      );
    }
    channel = channel
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
