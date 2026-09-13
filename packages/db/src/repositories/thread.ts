/**
 * Gate 1b: the bot's working memory, read from Postgres.
 *
 * Until now the receptionist's memory lived in Vercel Blob and Postgres was a
 * write-only shadow — which meant every surface we built read a MIRROR of the
 * truth, and the two had to be kept in step by hand. Three of our worst bugs
 * came from that gap (an operator take-over clobbered by a webhook writing a
 * stale whole-object, archived threads swallowing new messages, a reply
 * scheduled before its mirror write).
 *
 * This returns the same four things the Blob blob did, so the caller's logic is
 * untouched — only the source moves:
 *   history      last turns fed to the model
 *   pausedUntil  a human is handling this thread
 *   replies      bot sends in the last 24h (rate cap)
 *   seen         retry dedupe — NOT needed here: ingest_inbound's is_new is an
 *                atomic gate on a unique index, which is strictly stronger than
 *                a 40-entry array that two concurrent lambdas could both miss.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

export interface ThreadTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PgThreadState {
  history: ThreadTurn[];
  seen: string[];
  pausedUntil: number;
  replies: number[];
  /**
   * Anything has ever LEFT on this conversation, at any time, from anyone.
   *
   * `history` cannot answer this: a voice call note is an inbound row whose
   * sender is "system" and assembleHistory maps every non-customer sender to
   * an assistant turn, so a customer who only ever phoned looks like one we
   * have written to. `replies` cannot either — it is a 24h window, and it
   * counts only the machine. The A2P footer on a first text reply is decided
   * by this, so it is computed from what actually went out.
   */
  repliedBefore: boolean;
}

/** Outbound rows only count as memory once they actually left. A canceled or
 *  failed send was never seen by the customer, so it must not appear in the
 *  model's context as something "we said". */
const DELIVERED = ["sent", "delivered", "read"];

const DAY_MS = 24 * 3600 * 1000;

/**
 * Blob-era voice notes, imported by the backfill as ordinary assistant turns.
 * Every one of them is now ALSO a native call_summary row written by the Retell
 * webhook, so leaving both in would show the model each call twice — in two
 * different formats — and it would reasonably conclude the customer phoned
 * twice as often as they did. The native row is canonical; this is the copy.
 */
const BLOB_CALL_NOTE = /^\[voice call note /;

const isBackfill = (m: { meta?: unknown }): boolean =>
  !!m.meta && typeof m.meta === "object" &&
  (m.meta as Record<string, unknown>).backfill === true;

/** "Got it, a person will look" is a courtesy, not an answer: it must not spend the cap that stops loops. */
const isAcknowledgement = (m: { meta?: unknown }): boolean =>
  !!m.meta && typeof m.meta === "object" &&
  (m.meta as Record<string, unknown>).ack === true;

/** True event time. A backfilled row has no channel_ts and its created_at is
 *  when the IMPORT ran, so it can only ever be placed approximately. */
const effectiveAt = (m: { channel_ts: string | null; created_at: string }): number =>
  new Date(m.channel_ts ?? m.created_at).getTime();

/**
 * A conversation's turns, as the model should see them.
 *
 * Extracted so the WhatsApp receptionist and the voice agent cannot end up
 * with different ideas of what was said. They used to: the bot read these rows
 * from Postgres while the voice agent read a six-turn slice out of the Blob
 * mirror, so the same customer got a different — and thinner — account of
 * themselves depending on which number they used.
 *
 * Four rules live here and nowhere else:
 *   - a blank body carries nothing to reason over
 *   - an outbound row only counts once it actually LEFT; a canceled or failed
 *     send was never seen, and must not appear as something "we said"
 *   - the backfilled copy of a call note loses to the native row
 *   - order is by when things HAPPENED, so yesterday's call sits before this
 *     morning's message
 */
type HistoryRow = {
  body: string | null;
  sender: string;
  direction: string;
  status: string | null;
  created_at: string;
  channel_ts: string | null;
  meta?: unknown;
};

export function assembleHistory(rows: HistoryRow[], limit: number): ThreadTurn[] {
  const kept = rows.filter((m) => {
    const body = (m.body ?? "").trim();
    if (!body) return false;
    if (m.direction === "outbound" && !DELIVERED.includes(String(m.status))) return false;
    if (isBackfill(m) && BLOB_CALL_NOTE.test(body)) return false;
    return true;
  });
  kept.sort((a, b) => effectiveAt(a) - effectiveAt(b));
  return kept
    .map((m) => ({
      // A call note is the customer's own history on another channel — one
      // agent, so it counts the same as a message.
      role: (m.sender === "customer" ? "user" : "assistant") as ThreadTurn["role"],
      content: (m.body ?? "").trim(),
    }))
    .slice(-limit);
}

/** The columns assembleHistory needs. One string, so no caller can under-select. */
export const HISTORY_COLUMNS = "body, sender, direction, type, status, created_at, channel_ts, meta";
export async function readThreadState(
  db: Db,
  tenantId: string,
  conversationId: string,
  pausedUntilIso: string | null,
  historyLimit = 16,
): Promise<PgThreadState> {
  const since = new Date(Date.now() - DAY_MS).toISOString();

  const [recent, replies] = await Promise.all([
    db
      .from("messages")
      .select(HISTORY_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(historyLimit * 3), // headroom: duplicates and blanks drop out below
    db
      .from("messages")
      .select("created_at, meta")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("sender", "ai")
      .eq("direction", "outbound")
      .in("status", DELIVERED)
      .gte("created_at", since),
  ]);

  if (recent.error) throw new Error(`readThreadState/history: ${recent.error.message}`);
  if (replies.error) throw new Error(`readThreadState/replies: ${replies.error.message}`);

  const history = assembleHistory((recent.data ?? []) as never, historyLimit);
  // From the rows already in hand, so this costs no extra round trip: an
  // outbound row that actually left is the only proof that we have written to
  // this person before.
  const repliedBefore = (recent.data ?? []).some(
    (m: { direction?: string | null; status?: string | null }) =>
      m.direction === "outbound" && DELIVERED.includes(String(m.status)),
  );

  return {
    history,
    repliedBefore,

    seen: [],
    pausedUntil: pausedUntilIso ? new Date(pausedUntilIso).getTime() : 0,
    // Imported rows carry the timestamp of the IMPORT, not of a send. Counting
    // them would let a backfill silence the bot for a day against a cap it
    // never actually spent.
    replies: (replies.data ?? [])
      .filter((r) => !isBackfill(r) && !isAcknowledgement(r))
      .map((r) => new Date(r.created_at).getTime()),
  };
}

/* -------------------------------------------------------------------------
 * ONE lead, ONE context — whichever number they used.
 * ---------------------------------------------------------------------- */

export interface LeadContext {
  contactId: string | null;
  conversationId: string | null;
  /** What to call them, if we know. */
  name: string | null;
  /** We have spoken before. False for a genuinely first contact. */
  returning: boolean;
  lastSeenAt: string | null;
  /** Cross-channel turns — calls and messages, in the order they happened. */
  history: ThreadTurn[];
  /** They asked us to stop. Carried so no caller has to look it up separately. */
  optedOut: boolean;
  /** The owner's notes on them — facts for the receptionist, never read aloud. */
  notes?: string | null;
}

const EMPTY_LEAD: LeadContext = {
  contactId: null,
  conversationId: null,
  name: null,
  returning: false,
  lastSeenAt: null,
  history: [],
  optedOut: false,
};

/**
 * Everything both agents know about one lead, from the one place that knows it.
 *
 * The WhatsApp receptionist and the voice agent are meant to be the same
 * receptionist — a customer who phoned yesterday and texts today should not
 * have to start again. They were not: the bot read this conversation from
 * Postgres while the voice agent read a six-turn slice out of the Blob mirror,
 * a store we are actively retiring. Same person, two different accounts of
 * them, and only one of the two kept up to date.
 *
 * READ-ONLY on purpose. A context lookup must never create a contact or a
 * conversation: an inbound call that is never answered, or a wrong number,
 * would otherwise leave a lead behind in the workspace. The real ingest paths
 * create rows; this one only reports what is already true.
 */
export async function readLeadContext(
  db: Db,
  tenantId: string,
  phoneE164: string,
  historyLimit = 16,
): Promise<LeadContext> {
  const { data: contact, error: cErr } = await db
    .from("contacts")
    .select("id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (cErr) throw new Error(`readLeadContext/contact: ${cErr.message}`);
  if (!contact) return EMPTY_LEAD;

  const { data: conv, error: vErr } = await db
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contact.id)
    .maybeSingle();
  if (vErr) throw new Error(`readLeadContext/conversation: ${vErr.message}`);

  let history: ThreadTurn[] = [];
  if (conv) {
    const { data: rows, error: hErr } = await db
      .from("messages")
      .select(HISTORY_COLUMNS)
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(historyLimit * 3);
    if (hErr) throw new Error(`readLeadContext/history: ${hErr.message}`);
    history = assembleHistory((rows ?? []) as never, historyLimit);
  }

  return {
    contactId: contact.id,
    conversationId: conv?.id ?? null,
    // display_name is what a human typed; wa_profile_name is what WhatsApp
    // reports. The human's version wins, and neither is invented.
    name: contact.display_name || contact.wa_profile_name || null,
    // Having said anything at all is what makes someone returning — not merely
    // existing as a row, which an outbound-only contact would also satisfy.
    returning: history.length > 0,
    lastSeenAt: contact.last_seen_at ?? null,
    history,
    optedOut: contact.consent === "opted_out" || contact.dnc === true,
    notes: contact.notes ?? null,
  };
}

/**
 * The lead, described for a model in a few plain lines.
 *
 * Shared so both agents introduce the same person the same way. Facts only —
 * a name we were given, whether we have spoken, when. Nothing inferred, and
 * nothing said at all when we know nothing, because "New caller" is itself a
 * useful and honest thing to tell an agent.
 */
export function describeLead(lead: LeadContext, now = new Date()): string {
  if (!lead.contactId) return "New contact — no prior history on record.";
  const bits: string[] = [];
  bits.push(lead.name ? `Name on record: ${lead.name}.` : "No name on record.");
  if (lead.returning) {
    const days = lead.lastSeenAt
      ? Math.floor((now.getTime() - new Date(lead.lastSeenAt).getTime()) / 86_400_000)
      : null;
    const when =
      days === null ? "" :
      days <= 0 ? " Last in touch today." :
      days === 1 ? " Last in touch yesterday." :
      ` Last in touch ${days} days ago.`;
    bits.push(`Returning contact.${when}`);
  } else {
    bits.push("First time reaching out.");
  }
  if (lead.optedOut) bits.push("They have asked not to receive messages.");
  // The owner's own words about them: facts to use, never to recite.
  const notes = (lead.notes ?? "").replace(/\s+/g, " ").trim();
  if (notes) bits.push(`Notes from the owner about them (use as facts, never read aloud or quoted): ${notes}`);
  return bits.join(" ");
}
