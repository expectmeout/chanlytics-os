/**
 * The live feed (Blueprint §5, decision 0019): every surface hears the database through here, so no surface knows
 * how. The database tells each workspace what changed (00265): a notice on the private topic `workspace:<id>:changes`
 * when a statement on a watched table changes its rows, once a transaction for each table and event, naming the table
 * and the event, and a call's statuses. It never carries a row; a surface that wants one reads it. Realtime admits a
 * member to their workspaces' topics (the one policy on realtime.messages) and lets nobody speak on them. The session
 * token is pushed to Realtime EXPLICITLY before the channel joins: relying on supabase-js's auth-listener propagation
 * races the join, and a private channel that joins as `anon` is refused.
 *
 * The topic is the authorization, so it carries no caller's suffix, and realtime-js hands back the channel it already
 * has for a topic and joins it once. So each client keeps one channel per topic and counts who listens on it: two
 * runners in one tab share it, and the last to leave removes it.
 */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

export interface SubscribeOptions {
  /** The workspace the tab shows: its topic is the one joined. A tab with none joins nothing. */
  tenantId?: string;
  /** Observability: called with SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED. */
  onStatus?: (status: string) => void;
}

type Event = "INSERT" | "UPDATE" | "DELETE";
const EVERY: readonly Event[] = ["INSERT", "UPDATE", "DELETE"];
const INSERTS: readonly Event[] = ["INSERT"];

/**
 * Tables whose changes must repaint the live surfaces (Blueprint §5), and the events each is told for. 00265's loop
 * makes a trigger for each, and database/each-workspace-is-told-what-changed.db.test.mjs holds the two equal: a table
 * joins the live feed with its trigger, in one change.
 */
const WATCHED: ReadonlyArray<{ table: string; events: readonly Event[] }> = [
  { table: "messages", events: INSERTS },
  { table: "conversations", events: EVERY }, // the pause and snooze clocks, other tabs
  { table: "escalations", events: EVERY }, // opened by the edge, resolved elsewhere
  { table: "calls", events: EVERY }, // a call starting, each live turn, its end, its analysis: told with its statuses
  { table: "notifications", events: INSERTS }, // an alert the edge kept: the bell repaints
  { table: "lines", events: EVERY }, // a line's saga step, its failure, its answer, its release: Setup repaints
  { table: "google_listings", events: EVERY }, // the listing linked, read, or removed: Setup and Reports repaint
  { table: "google_reviews", events: INSERTS }, // a review seen for the first time
  { table: "billing_accounts", events: EVERY }, // Stripe's answer, applied by the webhook: Billing and Setup repaint
  { table: "tenant_channels", events: EVERY }, // a channel connected, switched off, or written by a line's saga: Setup and Connections repaint (00117)
  { table: "capability_activations", events: EVERY }, // the owner's act, in another tab: Setup repaints (00108)
  { table: "business_records", events: EVERY }, // the record the carriers read, saved on Connections: Setup repaints (00075)
  { table: "google_connections", events: EVERY }, // the profile connected, synced or failing by the hourly sweep: Connections repaints (00070)
  { table: "sending_domains", events: EVERY }, // a domain added, checked, verified, held or removed: Connections repaints (00175)
  // a round's page committed, a check landed, a class changed: the Leads scope repaints (00140)
  { table: "leads", events: EVERY },
  { table: "lead_searches", events: EVERY },
  { table: "lead_rounds", events: EVERY },
  { table: "lead_search_members", events: EVERY },
  // a deal recorded or moved by a teammate, or by a payment: People (and its Pipeline) repaints (00156, 0008)
  { table: "deals", events: EVERY },
  // a note written, a step set or done, or a note removed by a teammate: People's next steps and a person's page repaint (00157, 00166)
  { table: "person_notes", events: EVERY },
  // a list made, renamed, archived, or people put on and taken off by a teammate: People's rail repaints (00169)
  { table: "segments", events: EVERY },
  { table: "segment_members", events: EVERY },
  // a reply to a reach-out read, drafted or undone: the Inbox's strip and chip repaint (00222)
  { table: "reach_out_replies", events: EVERY },
];

/** The tables the database tells a workspace about: a surface's refreshOnTables can only name one of these. */
export function watchedTables(): string[] {
  return WATCHED.map((w) => w.table);
}

/** Each watched table and the events it is told for, as 00265 makes its triggers. */
export function watchedEvents(): Array<{ table: string; events: Event[] }> {
  return WATCHED.map((w) => ({ table: w.table, events: [...w.events] }));
}

/** What a surface hears of a change: the workspace, and a call's status. Never the row. */
type OnChange = (row: { tenant_id: string; status?: string }, table: string, event: string) => void;

interface Listener {
  onChange: OnChange;
  onStatus?: (status: string) => void;
}

/** One topic on one client: its listeners, and the one channel they share. */
interface Hearing {
  readonly listeners: Set<Listener>;
  channel: RealtimeChannel | null;
  /** The channel's last report, told to a listener that arrives after it. */
  status: string | null;
  joining: Promise<void> | null;
  /** The topic's last channel leaving: realtime-js would hand it back, and it would never join again. */
  leaving: Promise<void>;
}

const hearings = new WeakMap<object, Map<string, Hearing>>();

export function subscribeWorkspaceChanges(
  client: SupabaseClient<Database>,
  /** Called with the table a change was told for, its event, and a row of the workspace and a call's status. */
  onChange: OnChange,
  opts: SubscribeOptions = {},
): () => void {
  const tenantId = opts.tenantId;
  if (!tenantId) return () => {};
  const topic = `workspace:${tenantId}:changes`;
  let byTopic = hearings.get(client);
  if (!byTopic) hearings.set(client, (byTopic = new Map<string, Hearing>()));
  const heard = byTopic;
  let h = heard.get(topic);
  if (!h) {
    h = { listeners: new Set(), channel: null, status: null, joining: null, leaving: Promise.resolve() };
    heard.set(topic, h);
  }
  const hearing = h;
  const listener: Listener = { onChange, onStatus: opts.onStatus };
  hearing.listeners.add(listener);
  const status = hearing.channel ? hearing.status : null;
  if (status) queueMicrotask(() => hearing.listeners.has(listener) && report(listener, topic, status));
  else if (!hearing.channel && !hearing.joining)
    // A session that cannot be read joins nothing: the shell hears the feed is down, and the next listener tries again.
    hearing.joining = join(client, tenantId, topic, hearing, heard).catch(() => {
      hearing.joining = null;
      for (const l of [...hearing.listeners]) report(l, topic, "CHANNEL_ERROR");
    });

  let left = false;
  return () => {
    if (left) return;
    left = true;
    hearing.listeners.delete(listener);
    if (hearing.listeners.size || !hearing.channel) return; // a join under way sees nobody left, and stops
    const channel = hearing.channel;
    hearing.channel = null;
    hearing.status = null;
    hearing.leaving = client.removeChannel(channel).then(
      () => undefined,
      () => undefined,
    );
    void hearing.leaving.then(() => forget(heard, topic, hearing));
  };
}

async function join(
  client: SupabaseClient<Database>,
  tenantId: string,
  topic: string,
  hearing: Hearing,
  heard: Map<string, Hearing>,
): Promise<void> {
  await hearing.leaving;
  // getSession reads local state (no network); the setAuth MUST land before the join, or the private channel joins
  // as anon and is refused.
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (token) await client.realtime.setAuth(token);
  hearing.joining = null;
  if (!hearing.listeners.size) return forget(heard, topic, hearing);
  const channel = client
    .channel(topic, { config: { private: true } })
    .on("broadcast", { event: "*" }, (message) => tell(hearing, tenantId, message));
  hearing.channel = channel;
  channel.subscribe((status) => {
    // A channel left behind says nothing to those listening on the topic's next one: its close is not their drop.
    if (hearing.channel !== channel) return;
    hearing.status = status;
    for (const listener of [...hearing.listeners]) report(listener, topic, status);
  });
}

/** A topic nobody listens on, and no channel of which is joining or leaving, is let go. */
function forget(heard: Map<string, Hearing>, topic: string, hearing: Hearing): void {
  if (hearing.listeners.size || hearing.channel || hearing.joining || heard.get(topic) !== hearing) return;
  heard.delete(topic);
}

function report(listener: Listener, topic: string, status: string): void {
  if (listener.onStatus) listener.onStatus(status);
  else if (status !== "SUBSCRIBED") console.warn("realtime_status", topic, status);
}

/**
 * A notice, handed to each listener as a change: its table, its event, and a row of the workspace. A call's notice
 * carries the statuses its statement left, and each is a change of its own, so a rule that reads a call's status
 * reads every one.
 */
function tell(hearing: Hearing, tenantId: string, message: { event?: string; payload?: unknown }): void {
  const notice = (message.payload ?? {}) as { table?: unknown; statuses?: unknown };
  if (typeof notice.table !== "string") return;
  const table = notice.table;
  const event = message.event ?? "*";
  const statuses = Array.isArray(notice.statuses) ? notice.statuses : [undefined];
  for (const listener of [...hearing.listeners])
    for (const status of statuses)
      listener.onChange({ tenant_id: tenantId, ...(typeof status === "string" ? { status } : {}) }, table, event);
}
