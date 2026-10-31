/**
 * The live feed (Blueprint §5, decision 0019): every surface hears the database through here, so no surface knows
 * how. The database tells each workspace what changed (00265): a notice on the private topic `workspace:<id>:changes`
 * when a statement on a watched table changes its rows, once a transaction for each table and event, naming the table
 * and the event, the statuses a call's or a message update's statement left, and the clock when it was told (`at`,
 * 00408). It never carries a row; a surface that wants one reads it. Realtime admits a member to their workspaces'
 * topics (the one policy on realtime.messages) and lets nobody speak on them. The session token is pushed to Realtime
 * EXPLICITLY before the channel joins: relying on supabase-js's auth-listener propagation races the join, and a private
 * channel that joins as `anon` is refused.
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
const INSERTS_AND_UPDATES: readonly Event[] = ["INSERT", "UPDATE"];
const UPDATES: readonly Event[] = ["UPDATE"];

/**
 * Tables whose changes must repaint the live surfaces (Blueprint §5), and the events each is told for. 00265's loop
 * makes a trigger for each, and database/each-workspace-is-told-what-changed.db.test.mjs holds the two equal: a table
 * joins the live feed with its trigger, in one change. Where a note says "when it moved", the event is told only when
 * a column a page draws holds something else than it did (00408): the trigger is narrowed, the list is not.
 */
const WATCHED: ReadonlyArray<{ table: string; events: readonly Event[] }> = [
  { table: "messages", events: INSERTS_AND_UPDATES }, // arrivals, then a send's ticks and a failure written late: an update is told with its statuses (00327)
  { table: "conversations", events: EVERY }, // the pause and snooze clocks, other tabs
  { table: "escalations", events: EVERY }, // opened by the edge, resolved elsewhere
  { table: "calls", events: EVERY }, // a call starting, each live turn, its end, its analysis: told with its statuses
  // an alert the edge kept, or one closed when what it asked for ended (00421, told when closed_at moved): the bell repaints
  { table: "notifications", events: INSERTS_AND_UPDATES },
  // a line's saga step, its failure, its answer, its release: Setup, the channels read (Connections, the Library, Live, the
  // composers) and People repaint. The hourly carriers' sweep writes a line only when its answer moved (a2p-sync.ts).
  { table: "lines", events: EVERY },
  { table: "google_listings", events: EVERY }, // the listing linked, read, or removed: Setup and Reports repaint
  // a review seen for the first time, and one answered, by the receptionist, a teammate or on Google: Today's Google line,
  // the bell and Reports' Reviews repaint. The update is told when the reply moved (00431), never for the sync's stamp.
  { table: "google_reviews", events: INSERTS_AND_UPDATES },
  { table: "billing_accounts", events: EVERY }, // Stripe's answer, applied by the webhook: Billing and Setup repaint
  // a channel connected, switched off, flagged by Meta, or written by a line's saga: Setup and the channels read
  // (Connections' WhatsApp and phone rows, the Library, Live, the composers) repaint (00117)
  { table: "tenant_channels", events: EVERY },
  { table: "capability_activations", events: EVERY }, // the owner's act, in another tab: Setup repaints (00108)
  { table: "business_records", events: EVERY }, // the record the carriers read, saved on Connections: Setup repaints (00075)
  { table: "google_connections", events: EVERY }, // the profile connected, synced or failing by the hourly sweep: Connections repaints (00070)
  { table: "mailbox_connections", events: EVERY }, // a mailbox connected, signed out, held, paused or removed, its day or records when they moved: Connections and the sheet repaint (00423)
  // a round's page committed, a check landed, a class changed: the Leads scope repaints (00140). A round's update is told
  // when its state, its question, its wait or its ending moved (00431), never for the counters each batch moves.
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
  // a reply to a sequence read, drafted or undone: the Inbox's strip and chip repaint (00222; sequence_replies since 00440)
  { table: "sequence_replies", events: EVERY },
  // a batch made by the sweep, approved, stopped, sending or finished: Today's Approve and Stop rows and Campaigns
  // repaint (00321; sequence_batches since 00440). Its sends are not watched: a batch's page reads them when it opens.
  { table: "sequence_batches", events: EVERY },
  // a sequence made, paused, resumed, renamed or ended, and a step changed by a teammate or stamped by the sweep's run:
  // Campaigns' rows and their acts repaint (00376; the sequence tables since 00440, decision 0060)
  { table: "sequences", events: EVERY },
  { table: "sequence_steps", events: EVERY },
  // a booking that arrived by email written, moved or withdrawn by the booking_read job: the Calendar repaints (00345)
  { table: "appointments", events: EVERY },
  // The records no page was told of (00408, 0047). A person made, or renamed, answered, stopped, merged or erased by a
  // teammate, a job or the customer's own link: People, the Inbox's thread heads and Campaigns' counts repaint. Their
  // updates are told when an identity or an answer moved; a message's stamp on last_seen_at is not one.
  { table: "contacts", events: INSERTS_AND_UPDATES },
  // The settings saved in another tab or by a teammate: Settings, the Calendar, Setup and the composers repaint. Told
  // when the version moved, so the hourly stamp on calendar_checked_at tells nothing. The receptionist's stamp reads it.
  { table: "tenant_config", events: UPDATES },
  // The Autonomy matrix, and a person's or a list's own rule: the chips beside every approval repaint. Read by the stamp.
  { table: "policies", events: EVERY },
  // Meta's answer to a template, a sync, a hide, a template made or removed: the Library and the composers repaint. The
  // update is told when its status, rejection, quality, category, visibility or words moved.
  { table: "templates", events: EVERY },
  // A mailbox made (Today's email line, Start's and Connections' Email row), and offers by email paused by the gate or
  // resumed by the back office (Campaigns' head line and send tick, People), its address or sender renamed, the code Gmail
  // mails to confirm a forward (the Calendar's Business tab) and its intake's error set or cleared (Connections). The
  // update is told when one of those moved (00431), never for the stamp every email puts on it.
  { table: "mailboxes", events: INSERTS_AND_UPDATES },
  // A booking email the reader held for a look, or settled: the Business tab's held list repaints.
  { table: "appointment_notices", events: INSERTS_AND_UPDATES },
  // A seat taken, changed or left, and an invitation sent, renewed, accepted or revoked: the Team pane and the workspace
  // list repaint, and a member whose own role moved is told. A seat's update is told when its role moved, never for the
  // member's own saved views.
  { table: "memberships", events: EVERY },
  { table: "invitations", events: EVERY },
  // The workspace paused or resumed (billing, the back office), renamed, its zone, its word for a booking or its logo
  // changed: the shell, the sidebar and Today's band repaint. Told when one of those moved (00431, 00458). The
  // receptionist's stamp reads the row.
  { table: "tenants", events: UPDATES },
  // What a connection brought in, a part at a time (the mailbox's months, its people and calendar, WhatsApp's chats), and
  // what the Business Profile and the website say: the first run's "Bringing it in", Found for you, Today's "Brought in"
  // and Connections' sentences repaint (00480, decision 0073).
  { table: "imports", events: EVERY },
  { table: "business_reads", events: EVERY },
  // A rehearsal made, heard and reviewed (decision 0069): the first run's Rehearse step and Today's card repaint (00480).
  { table: "rehearsals", events: EVERY },
];

/**
 * The updates told only when a column a page draws holds something else than it did (00408, 00431), and the columns each
 * is narrowed to: a row trigger, AFTER UPDATE OF them, WHEN one is distinct, so a stamp tells nothing. A column added here
 * is a decision about what a page draws, made with its migration; database/each-workspace-is-told-what-changed.db.test.mjs
 * holds the triggers equal to this list. `null` is a table with no list: the settings are told when their version moved,
 * whatever a write named.
 */
const NARROWED_UPDATES: Readonly<Record<string, readonly string[] | null>> = {
  // A notice closed when what it asked for ended (00421): the bell reads it as read, on every tab.
  notifications: ["closed_at"],
  // The identity, the answers, the merge and the erasure of a person, and where they work and where their name came from
  // (0052). Not last_seen_at, offers_asked_at or the first-touch stamps, which a message writes.
  contacts: [
    "display_name",
    "wa_profile_name",
    "phone_e164",
    "email",
    "notes",
    "proposal_url",
    "consent",
    "consent_source",
    "consent_updated_at",
    "dnc",
    "marketing_consent",
    "marketing_consent_source",
    "marketing_consent_updated_at",
    "email_marketing",
    "email_marketing_source",
    "email_marketing_updated_at",
    "consent_channels",
    "marketing_channels",
    "email_suppressed_at",
    "email_suppressed_reason",
    "merged_into_contact_id",
    "erased_at",
    "lead_id",
    "name_source",
  ],
  tenant_config: null,
  // Meta's answer and why, its quality and category, whether the workspace hid it, and the words. Not synced_at.
  templates: [
    "meta_status",
    "rejected_reason",
    "quality",
    "category",
    "hidden_at",
    "title",
    "body_preview",
    "components",
    "variables",
  ],
  // Its address, sender and reply mode, the pause on offers, Gmail's forwarding code and the intake's error. Not
  // last_received_at, which every email writes (00431).
  mailboxes: [
    "local_part",
    "from_name",
    "reply_mode",
    "offers_paused_at",
    "offers_paused_reason",
    "offers_resumed_at",
    "forward_confirm_account",
    "forward_confirm_code",
    "forward_confirm_link",
    "forward_confirm_at",
    "last_error",
  ],
  // A mailbox the business connected (00423): what Connections draws, never the sync's cursor, its watch or a send's stamp.
  // Its choice of history (00499): Bring in the last 6 months goes once it is the six months.
  mailbox_connections: [
    "state",
    "held_why",
    "resting_until",
    "daily_cap",
    "customer_domain",
    "sent_days",
    "dns",
    "last_error",
    "from_name",
    "signature",
    "address",
    "history",
  ],
  // A seat's role. Not the member's saved views or push choices, which are their own.
  memberships: ["role"],
  // The workspace's status, name, zone, word for a booking and logo (00431, 00458, 00460).
  tenants: ["status", "name", "timezone", "appointment_word", "logo_path"],
  // A review answered (00431), and the reply it holds written, stopped or posted (00462). Not last_seen_at, which the
  // sync stamps on every review.
  google_reviews: ["reply_text", "replied_at", "draft_text", "posts_at"],
  // What a round is and what it waits on (00431). Not its allowance, cost or judge's tokens and model.
  lead_rounds: [
    "state",
    "ending",
    "ending_pending",
    "question",
    "answered",
    "target",
    "nearby",
    "waiting_since",
    "ended_at",
    "plan_version",
  ],
};

/** Each narrowed update's table and the columns it is told for (null: told when the version moved), as a copy. */
export function narrowedUpdates(): Record<string, string[] | null> {
  return Object.fromEntries(Object.entries(NARROWED_UPDATES).map(([t, cols]) => [t, cols ? [...cols] : null]));
}

/** The tables the database tells a workspace about: a surface's refreshOnTables can only name one of these. */
export function watchedTables(): string[] {
  return WATCHED.map((w) => w.table);
}

/** Each watched table and the events it is told for, as 00265 makes its triggers. */
export function watchedEvents(): Array<{ table: string; events: Event[] }> {
  return WATCHED.map((w) => ({ table: w.table, events: [...w.events] }));
}

/**
 * What a surface hears of a change: the workspace, and a call's or a message update's status. Never the row. And, as the
 * fourth argument, the clock the database told it by (`at`, ISO 8601 in UTC): absent from a notice sent before 00408.
 */
type OnChange = (row: { tenant_id: string; status?: string }, table: string, event: string, at?: string) => void;

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
  /** Called with the table a change was told for, its event, and a row of the workspace and its status, where it has one. */
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
 * A notice, handed to each listener as a change: its table, its event, a row of the workspace, and the clock it was
 * told by (`at`) where it carries one. A call's notice, and a message update's, carries the statuses its statement
 * left, and each is a change of its own, so a rule that reads a status reads every one; they share the notice's clock.
 */
function tell(hearing: Hearing, tenantId: string, message: { event?: string; payload?: unknown }): void {
  const notice = (message.payload ?? {}) as { table?: unknown; statuses?: unknown; at?: unknown };
  if (typeof notice.table !== "string") return;
  const table = notice.table;
  const event = message.event ?? "*";
  const at = typeof notice.at === "string" ? notice.at : undefined;
  const statuses = Array.isArray(notice.statuses) ? notice.statuses : [undefined];
  for (const listener of [...hearing.listeners])
    for (const status of statuses)
      listener.onChange({ tenant_id: tenantId, ...(typeof status === "string" ? { status } : {}) }, table, event, at);
}
