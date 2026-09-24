/**
 * The receptionist's working memory, read from Postgres — the only place it
 * lives.
 *
 * It used to live in Vercel Blob with Postgres as a write-only shadow, which
 * meant every surface we built read a MIRROR of the truth and the two had to
 * be kept in step by hand. Three of our worst bugs came from that gap (an
 * operator take-over clobbered by a webhook writing a stale whole-object,
 * archived threads swallowing new messages, a reply scheduled before its
 * mirror write). The rows the dashboard reads and writes ARE the memory now:
 *   history      last turns fed to the model
 *   pausedUntil  a human is handling this thread
 *   replies      bot sends in the last 24h (rate cap)
 * Retry dedupe is not here and needs nothing here: ingest_inbound's is_new is
 * an atomic gate on a unique index, which is strictly stronger than the
 * 40-entry array the store kept, and which two concurrent lambdas could both
 * miss.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type DealFacts,
  clockDate,
  dealSentence,
  dealsAreOn,
  pickCurrentDeal,
  proposalLinkOf,
} from "@chanlytics/contracts";
import type { Database } from "../database.types";

type Db = SupabaseClient<Database>;

export interface ThreadTurn {
  role: "user" | "assistant";
  content: string;
}

export interface PgThreadState {
  history: ThreadTurn[];
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
 * Voice notes moved in from before the database, as ordinary assistant turns.
 * Every one of them is now ALSO a native call_summary row written by the Retell
 * webhook, so leaving both in would show the model each call twice — in two
 * different formats — and it would reasonably conclude the customer phoned
 * twice as often as they did. The native row is canonical; this is the copy.
 */
const IMPORTED_CALL_NOTE = /^\[voice call note /;

const isBackfill = (m: { meta?: unknown }): boolean =>
  !!m.meta && typeof m.meta === "object" && (m.meta as Record<string, unknown>).backfill === true;

/** "Got it, a person will look" is a courtesy, not an answer: it must not spend the cap that stops loops. */
const isAcknowledgement = (m: { meta?: unknown }): boolean =>
  !!m.meta && typeof m.meta === "object" && (m.meta as Record<string, unknown>).ack === true;

/** True event time. A backfilled row has no channel_ts and its created_at is
 *  when the IMPORT ran, so it can only ever be placed approximately. */
const effectiveAt = (m: { channel_ts: string | null; created_at: string }): number =>
  new Date(m.channel_ts ?? m.created_at).getTime();

/**
 * A conversation's turns, as the model should see them.
 *
 * Extracted so the WhatsApp receptionist and the voice agent cannot end up
 * with different ideas of what was said. They used to: the bot read these rows
 * from Postgres while the voice agent read a six-turn slice out of the store
 * that has since been retired, so the same customer got a different — and
 * thinner — account of themselves depending on which number they used.
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
    if (isBackfill(m) && IMPORTED_CALL_NOTE.test(body)) return false;
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
  /** Whether an email address is on file for them: the receptionist asks for one only when there is none (the booking rule ask_email). Undefined for a reader that never learned it, which says nothing. */
  hasEmail?: boolean;
  /** The owner's notes on them — facts for the receptionist, never read aloud. The field 00157 superseded: said only
   *  where the notes themselves could not be read (`noteList` null or absent). */
  notes?: string | null;
  /** The notes the receptionist reads (0007): kept, not for the team only, newest first. Null where they could not
   *  be read. Optional so every fake still compiles. */
  noteList?: { body: string; at: string }[] | null;
  /**
   * Their proposal, as a web address: the current deal's while it is a proposal out, none for any other deal, the
   * person's own only with no deal at all (proposalLinkOf, 0008); none where deals are off. Sent when they ask about
   * price, its figures never stated.
   */
  proposalUrl?: string | null;
  /**
   * Their deal (0004), the newest open or current one: the sentence the receptionist hears; none where deals are off
   * (dealsAreOn, 0008). Optional so every fake still compiles.
   */
  deal?: DealFacts | null;
}

/** The workspace's answer to how its customers buy, from a contact read that embeds `tenants(sells_by)`. */
function sellsByOf(embedded: unknown): string | null {
  const t = Array.isArray(embedded) ? embedded[0] : embedded;
  const v = t && typeof t === "object" ? (t as { sells_by?: unknown }).sells_by : null;
  return typeof v === "string" ? v : null;
}

/** A read that names tenants.sells_by on a database 00160 has not reached answers "column does not exist". */
const noSellsBy = (message: string): boolean =>
  /\bsells_by\b/.test(message) && /does not exist|could not find/i.test(message);

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
 * Postgres while the voice agent read a six-turn slice out of a mirror that
 * has since been retired. Same person, two different accounts of them, and
 * only one of the two kept up to date.
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
  // Who they are, and in the same round trip how their workspace's customers buy (0008): a deal and a proposal link are
  // the receptionist's to say only where deals are on. A database 00160 has not reached answers "column does not exist"
  // for the answer: read again without it, and deals are off there, as they would be.
  const withAnswer = await db
    .from("contacts")
    .select(
      "id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url, email, tenants(sells_by)",
    )
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  let contact: {
    id: string;
    display_name: string | null;
    wa_profile_name: string | null;
    last_seen_at: string | null;
    consent: string;
    dnc: boolean;
    notes: string | null;
    proposal_url: string | null;
    email: string | null;
    sellsBy: string | null;
  } | null = withAnswer.data ? { ...withAnswer.data, sellsBy: sellsByOf(withAnswer.data.tenants) } : null;
  let cErr = withAnswer.error;
  if (cErr && noSellsBy(cErr.message)) {
    const older = await db
      .from("contacts")
      .select("id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url, email")
      .eq("tenant_id", tenantId)
      .eq("phone_e164", phoneE164)
      .maybeSingle();
    contact = older.data ? { ...older.data, sellsBy: null } : null;
    cErr = older.error;
  }
  if (cErr) throw new Error(`readLeadContext/contact: ${cErr.message}`);
  if (!contact) return EMPTY_LEAD;
  const dealsOn = dealsAreOn(contact.sellsBy);

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

  // Their deal, read beside the note (0004), only where deals are on: a context lookup must never cost the reply, so an
  // error is no deal. The whole list, because the current one may be the oldest: a running engagement outlives any
  // number of newer proposals for other services, and a cap would hide it behind them. With its link (0008): the
  // proposal the receptionist sends.
  const { data: dealRows } = dealsOn
    ? await db
        .from("deals")
        .select("stage, service, proposed_at, decided_at, ended_at, created_at, proposal_url")
        .eq("tenant_id", tenantId)
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false })
    : { data: [] };
  const current = pickCurrentDeal(dealRows ?? []);

  // Their notes (0007): the kept ones that are not for the team only. Never a suggestion the receptionist wrote
  // itself, which waits for a person to keep it. An error is no list, and the old field is said instead.
  const { data: noteRows, error: nErr } = await db
    .from("person_notes")
    .select("body, created_at")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contact.id)
    .eq("state", "kept")
    .eq("team_only", false)
    .order("created_at", { ascending: false })
    .limit(NOTES_READ);

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
    hasEmail: !!contact.email,
    notes: contact.notes ?? null,
    noteList: nErr ? null : (noteRows ?? []).map((n) => ({ body: n.body, at: n.created_at })),
    proposalUrl: dealsOn ? proposalLinkOf(current, contact.proposal_url) : null,
    deal: current
      ? {
          stage: current.stage,
          service: current.service,
          proposed_at: current.proposed_at,
          decided_at: current.decided_at,
          ended_at: current.ended_at,
        }
      : null,
  };
}

/**
 * The deal facts for a caller known by their number, or null: what the availability door needs and nothing more (0004).
 * None where deals are off (dealsAreOn, 0008): the workspace's answer rides on the contact read, and a database that
 * cannot say it has deals off. Every deal of theirs is read, because the current one may be the oldest (see
 * readLeadContext).
 */
export async function readDealForPhone(db: Db, tenantId: string, phoneE164: string): Promise<DealFacts | null> {
  const { data: c } = await db
    .from("contacts")
    .select("id, tenants(sells_by)")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (!c || !dealsAreOn(sellsByOf(c.tenants))) return null;
  const { data } = await db
    .from("deals")
    .select("stage, service, proposed_at, decided_at, ended_at, created_at")
    .eq("tenant_id", tenantId)
    .eq("contact_id", c.id)
    .order("created_at", { ascending: false });
  const d = pickCurrentDeal(data ?? []);
  return d
    ? { stage: d.stage, service: d.service, proposed_at: d.proposed_at, decided_at: d.decided_at, ended_at: d.ended_at }
    : null;
}

/**
 * The lead, described for a model in a few plain lines.
 *
 * Shared so both agents introduce the same person the same way. Facts only —
 * a name we were given, whether we have spoken, when. Nothing inferred, and
 * nothing said at all when we know nothing, because "New caller" is itself a
 * useful and honest thing to tell an agent.
 */
/** How many notes are read for the receptionist, and how many characters of them it is given (0007). */
const NOTES_READ = 12;
const NOTES_BUDGET = 1200;

/**
 * The team's notes as the receptionist hears them (0007): newest first, each dated, as many as fit the budget -- the
 * newest always, however long. Where the notes could not be read, the field they moved from (00054), as it was said.
 */
export function notesForReceptionist(lead: LeadContext, now = new Date(), tz = "UTC"): string | null {
  if (Array.isArray(lead.noteList)) {
    const parts: string[] = [];
    let used = 0;
    for (const n of lead.noteList) {
      const body = n.body.replace(/\s+/g, " ").trim();
      if (!body) continue;
      const t = Date.parse(n.at);
      const part = Number.isFinite(t) ? `(${clockDate(t, tz, now.getTime())}) ${body}` : body;
      if (parts.length && used + part.length > NOTES_BUDGET) break;
      parts.push(part);
      used += part.length + 2;
    }
    return parts.length
      ? `Notes from the team about them, newest first (use as facts, never read aloud or quoted): ${parts.join("; ")}`
      : null;
  }
  const notes = (lead.notes ?? "").replace(/\s+/g, " ").trim();
  return notes ? `Notes from the owner about them (use as facts, never read aloud or quoted): ${notes}` : null;
}

export function describeLead(lead: LeadContext, now = new Date(), tz = "UTC"): string {
  if (!lead.contactId) return "New contact — no prior history on record.";
  const bits: string[] = [];
  bits.push(lead.name ? `Name on record: ${lead.name}.` : "No name on record.");
  // Whether an address is on file, so the receptionist asks for one only when there is none (booking rule ask_email);
  // a reader that never learned it (undefined) says nothing rather than a guess.
  if (lead.hasEmail === true) bits.push("Their email address is on file.");
  else if (lead.hasEmail === false) bits.push("No email address on file.");
  if (lead.returning) {
    const days = lead.lastSeenAt
      ? Math.floor((now.getTime() - new Date(lead.lastSeenAt).getTime()) / 86_400_000)
      : null;
    const when =
      days === null
        ? ""
        : days <= 0
          ? " Last in touch today."
          : days === 1
            ? " Last in touch yesterday."
            : ` Last in touch ${days} days ago.`;
    bits.push(`Returning contact.${when}`);
  } else {
    bits.push("First time reaching out.");
  }
  if (lead.optedOut) bits.push("They have asked not to receive messages.");
  // The team's own words about them: facts to use, never to recite.
  const notes = notesForReceptionist(lead, now, tz);
  if (notes) bits.push(notes);
  // Their deal (0004): one sentence per stage, never an amount. Where a proposal link is on file, the link's own rule
  // answers a price question, so the proposal's sentence points at it instead of promising a follow-up.
  const deal = dealSentence(lead.deal ?? null, now.getTime(), tz, { hasLink: !!(lead.proposalUrl ?? "").trim() });
  if (deal) bits.push(deal);
  // The owner's priced answer for this person is a link (00154), the deal's now (0008):
  // the receptionist hands it over and prices nothing itself. No link, nothing said.
  const proposal = (lead.proposalUrl ?? "").trim();
  if (proposal)
    bits.push(
      `The owner has a proposal ready for them at ${proposal}. If they ask about price, a quote or the proposal, send that link and state none of its figures; on a call, never read the address out — say it is being sent to them in writing.`,
    );
  return bits.join(" ");
}
