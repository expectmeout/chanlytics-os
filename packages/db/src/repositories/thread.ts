/**
 * A repository, in this codebase's sense, is the one place a table's rows are read and written as typed facts, so a
 * caller asks for the fact and does not spell the table; the database client comes in as an argument (the edge's
 * service role, or a member's session client) and is never made here. This one only reads: what the agents and the
 * dashboard know about a conversation, from Postgres, the only place the receptionist's memory lives (messages,
 * contacts, conversations, deals and person_notes, and the search_messages function). Its groups:
 *   - A thread's state (readThreadState, assembleHistory, HISTORY_COLUMNS, liveHoldOf): the turns the model is shown,
 *     the pause a human set (handed in by the caller), the receptionist's own sends in the last day (its rate cap),
 *     whether a text of ours ever reached them (textedBefore, which decides the A2P footer), and the live hold on the
 *     thread (control: a call in progress, a person who took it over). assembleHistory alone decides what counts as a
 *     turn, so the WhatsApp receptionist and the voice agent cannot disagree about what was said. Called by the edge's
 *     WhatsApp persistence, steer door and reach-out reply draft.
 *   - A lead's context (readLeadContext, readDealForPhone, describeLead, notesForReceptionist): one person by phone
 *     number across channels, and the plain lines a model is told about them. Called by the edge's WhatsApp ports,
 *     voice call start and steer door; the availability door asks readDealForPhone.
 *   - Finding words (searchMessages, messageSenders): Ask's message search, called by the dashboard's message reader.
 *   - Whether a message has its answer (repliedTo): a reply that names it (meta.reply_to), whatever became of it. What a
 *     text's answer taken up again after its runner died asks before it speaks twice. And when the message a reply
 *     answers was sent (replyAnswersAt), which the send door measures a held draft's lateness from.
 * Every read names the tenant, so a service-role caller cannot cross workspaces and a session client is narrowed by
 * RLS as well. A failed read throws, because a thread the database could not produce is unknown and never empty (a
 * blank thread reads as no pause, nothing said and no replies spent: core's inbound/thread.ts); only a lead's deal and
 * notes are best effort, so a context lookup never costs the reply. readLeadContext is read-only: it never makes a
 * contact or a conversation. Retry dedupe is not here: ingest_inbound's is_new is an atomic gate on a unique index.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fencedInline,
  promptSafeName,
  type DealFacts,
  type LeadChannel,
  clockDate,
  DAY_MS,
  dealIsOpen,
  dealSentence,
  offersFacts,
  disclosureFacts,
  pickCurrentDeal,
  proposalLinkOf,
} from "@chanlytics/contracts";
import type { Database } from "../database.types";
import { IDS_PER_READ } from "./people";

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
   * A TEXT of ours has ever reached this person on this conversation, at any time, from anyone: an outbound row on the
   * texting wire that left. The A2P footer on a first text reply is decided by this alone (the campaign filing promises
   * the rates/STOP/HELP line on the first text), so it is asked of the database outright.
   *
   * Nothing else in hand can answer it. `history` reads a voice call note, an inbound row whose sender is "system", as
   * an assistant turn, so a customer who only ever phoned looked like one we had written to. `replies` is a 24-hour
   * window of the machine's sends on any wire. And "anything ever left", which this was until W2, said yes for a
   * person a WhatsApp or email campaign had reached: their first text reply then went out without the line.
   */
  textedBefore: boolean;
  /**
   * The live hold on the thread (00132): who is speaking on it now, the call's own id when a call holds it, and until
   * when; null when nobody does. The same columns the send door reads at the wire (core deliver.ts wireFacts), read
   * here so the receptionist can ask the wire's question before the model is asked, and spend no turn on words a
   * call's hold would refuse.
   */
  control: LiveHold | null;
}

/** The thread's live hold as its row says it (00132): who, the call's own ref, until when. */
export interface LiveHold {
  kind: string;
  ref: string | null;
  until: string;
}

/**
 * The live hold a conversation row carries, or null: a kind with no end is none, as the send door reads the same
 * columns (core deliver.ts wireFacts). THE one reading of those columns.
 */
export function liveHoldOf(row: {
  control_kind?: string | null;
  control_ref?: string | null;
  control_until?: string | null;
}): LiveHold | null {
  return row.control_kind && row.control_until
    ? { kind: row.control_kind, ref: row.control_ref ?? null, until: row.control_until }
    : null;
}

/** Outbound rows only count as memory once they actually left. A canceled or
 *  failed send was never seen by the customer, so it must not appear in the
 *  model's context as something "we said". */
export const DELIVERED = ["sent", "delivered", "read"];

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

/** The rows that count as turns under the four rules, oldest first. */
function keptTurns<T extends HistoryRow>(rows: T[]): T[] {
  const kept = rows.filter((m) => {
    const body = (m.body ?? "").trim();
    if (!body) return false;
    if (m.direction === "outbound" && !DELIVERED.includes(String(m.status))) return false;
    if (isBackfill(m) && IMPORTED_CALL_NOTE.test(body)) return false;
    return true;
  });
  return kept.sort((a, b) => effectiveAt(a) - effectiveAt(b));
}

export function assembleHistory(rows: HistoryRow[], limit: number): ThreadTurn[] {
  return keptTurns(rows)
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

  const [recent, replies, texted, hold] = await Promise.all([
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
    // One row is the answer: a text of ours that left, at any time. Not read off `recent`, which is the last few
    // rows of every wire: a long thread's first text would fall out of it, and a campaign by WhatsApp or email is in it.
    db
      .from("messages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .eq("channel", "sms")
      .in("status", DELIVERED)
      .limit(1),
    // The thread's live hold (00132): the columns the send door reads at the wire, read here so a text that arrives
    // while a call holds the thread is set aside before the model is asked (core inbound reply-gates.ts).
    db
      .from("conversations")
      .select("control_kind, control_ref, control_until")
      .eq("tenant_id", tenantId)
      .eq("id", conversationId)
      .maybeSingle(),
  ]);

  if (recent.error) throw new Error(`readThreadState/history: ${recent.error.message}`);
  if (replies.error) throw new Error(`readThreadState/replies: ${replies.error.message}`);
  if (texted.error) throw new Error(`readThreadState/texted: ${texted.error.message}`);
  if (hold.error) throw new Error(`readThreadState/hold: ${hold.error.message}`);

  const history = assembleHistory(recent.data ?? [], historyLimit);

  return {
    history,
    textedBefore: (texted.data ?? []).length > 0,
    pausedUntil: pausedUntilIso ? new Date(pausedUntilIso).getTime() : 0,
    control: liveHoldOf(hold.data ?? {}),
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
  /** The name on record is the business they are at (0052, name_source lead), never to be called theirs. Optional. */
  standIn?: boolean;
  /** We have spoken before. False for a genuinely first contact. */
  returning: boolean;
  lastSeenAt: string | null;
  /** Cross-channel turns — calls and messages, in the order they happened. */
  history: ThreadTurn[];
  /** They asked us to stop. Carried so no caller has to look it up separately. */
  optedOut: boolean;
  /** Whether an email address is on file for them: the receptionist asks for one only when there is none (the booking rule ask_email). Undefined for a reader that never learned it, which says nothing. */
  hasEmail?: boolean;
  /**
   * Their answer about offers (contacts.marketing_consent: unknown, opted_in or opted_out), and when the receptionist
   * first asked for the yes (contacts.offers_asked_at: null = never asked). `offersAskedAt` is undefined where the
   * database has not got the column yet: the receptionist then says nothing that lets it ask (contracts offersFacts).
   * Both optional, so a reader that never learned them and every fake still compile.
   */
  marketingConsent?: string | null;
  /**
   * The channels that yes covers (contacts.marketing_channels, consent-channels.ts): null where none are kept, a yes
   * recorded before the channels were, which covers WhatsApp alone. Undefined where the column could not be read,
   * which reads the same way (contracts yesCovers). A yes kept for text alone is not a yes on WhatsApp.
   */
  marketingChannels?: string[] | null;
  offersAskedAt?: string | null;
  /** The owner's notes on them — facts for the receptionist, never read aloud. The field 00157 superseded: said only
   *  where the notes themselves could not be read (`noteList` null or absent). */
  notes?: string | null;
  /** The notes the receptionist reads (0007): kept, not for the team only, newest first. Null where they could not
   *  be read. Optional so every fake still compiles. */
  noteList?: { body: string; at: string }[] | null;
  /**
   * Their proposal, as a web address: the current deal's while it is a proposal out, none for any other deal, the
   * person's own only with no deal at all (proposalLinkOf, 0008). Sent when they ask about price, its figures never
   * stated.
   */
  proposalUrl?: string | null;
  /**
   * Their deal (0004), the newest open or current one: the sentence the receptionist hears, in every workspace (0008,
   * amended 18 Oct 2026). Optional so every fake still compiles.
   */
  deal?: DealFacts | null;
  /**
   * Their other open deals (0029), newest first, each with its proposal's link: a client of one service may have a
   * proposal out for another, and the receptionist hears each. Empty where none; optional so every fake still compiles.
   */
  otherDeals?: DealFacts[];
}

/** The same answer for contacts.offers_asked_at or marketing_channels, on a database the migration that adds them has not reached. */
const noOffersColumns = (message: string): boolean =>
  /\b(offers_asked_at|marketing_channels)\b/.test(message) && /does not exist|could not find/i.test(message);

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
  who: string | { contactId: string }, // the number they write from; on a wire with none (a DM), their own row
  historyLimit = 16,
  /** The message being answered, stored before they were read: not their history, nor their last touch (none on a call). */
  answering?: string,
): Promise<LeadContext> {
  // Who they are, and whether they were ever asked for the yes to offers, and on which channels that yes holds
  // (offers_asked_at and marketing_channels, One message, every channel, step 2): the edge may deploy before its
  // migration, and a missing column must cost the answer to that one question, never who they are. Read again without
  // them, and the receptionist is told nothing that lets it ask (contracts offersFacts). Their deals and proposal link
  // are the receptionist's to say in every workspace (0008, amended 18 Oct 2026: deals for everyone).
  const withAnswer = await db
    .from("contacts")
    .select(
      "id, display_name, wa_profile_name, name_source, last_seen_at, consent, dnc, notes, proposal_url, email, marketing_consent, marketing_channels, offers_asked_at",
    )
    .eq("tenant_id", tenantId)
    .eq(typeof who === "string" ? "phone_e164" : "id", typeof who === "string" ? who : who.contactId)
    .maybeSingle();
  let contact: {
    id: string;
    display_name: string | null;
    wa_profile_name: string | null;
    name_source?: string | null;
    last_seen_at: string | null;
    consent: string;
    dnc: boolean;
    notes: string | null;
    proposal_url: string | null;
    email: string | null;
    marketing_consent: string;
    marketing_channels?: string[] | null;
    offers_asked_at?: string | null;
  } | null = withAnswer.data;
  let cErr = withAnswer.error;
  if (cErr && noOffersColumns(cErr.message)) {
    const unasked = await db
      .from("contacts")
      .select(
        "id, display_name, wa_profile_name, last_seen_at, consent, dnc, notes, proposal_url, email, marketing_consent",
      )
      .eq("tenant_id", tenantId)
      .eq(typeof who === "string" ? "phone_e164" : "id", typeof who === "string" ? who : who.contactId)
      .maybeSingle();
    contact = unasked.data;
    cErr = unasked.error;
  }
  if (cErr) throw new Error(`readLeadContext/contact: ${cErr.message}`);
  if (!contact) return EMPTY_LEAD;

  const { data: conv, error: vErr } = await db
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contact.id)
    .maybeSingle();
  if (vErr) throw new Error(`readLeadContext/conversation: ${vErr.message}`);

  const { history, lastTurnAt } = conv
    ? await turnsBefore(db, tenantId, conv.id, historyLimit, answering)
    : { history: [], lastTurnAt: null };

  // Their deal, read beside the note (0004): a context lookup must never cost the reply, so an error is no deal. The
  // whole list, because the current one may be the oldest: a running engagement outlives any number of newer proposals
  // for other services, and a cap would hide it behind them. With its link (0008): the proposal the receptionist sends.
  const { data: dealRows } = await db
    .from("deals")
    .select("stage, service, proposed_at, decided_at, ended_at, created_at, proposal_url")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false });
  const current = pickCurrentDeal(dealRows ?? []);
  // Every other open deal of theirs, newest first (0029): a proposal out for one service beside a client of another.
  const others = (dealRows ?? []).filter((d) => d !== current && dealIsOpen(d));

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
    standIn: contact.name_source === "lead" && !!contact.display_name, // the business's own name (0052)
    // Having said anything at all is what makes someone returning — not merely
    // existing as a row, which an outbound-only contact would also satisfy.
    returning: history.length > 0,
    lastSeenAt: answering ? lastTurnAt : (contact.last_seen_at ?? null),
    history,
    optedOut: contact.consent === "opted_out" || contact.dnc === true,
    hasEmail: !!contact.email,
    marketingConsent: contact.marketing_consent,
    marketingChannels: contact.marketing_channels,
    // Undefined where the column could not be read: not null, which says "never asked".
    offersAskedAt: contact.offers_asked_at,
    notes: contact.notes ?? null,
    noteList: nErr ? null : (noteRows ?? []).map((n) => ({ body: n.body, at: n.created_at })),
    proposalUrl: proposalLinkOf(current, contact.proposal_url),
    deal: current ? dealRowFacts(current) : null,
    otherDeals: others.map((d) => ({ ...dealRowFacts(d), proposal_url: d.proposal_url })),
  };
}

/** A person's turns, and when the newest happened, without the message being answered (readLeadContext's `answering`). */
async function turnsBefore(db: Db, tenantId: string, conversationId: string, limit: number, answering?: string) {
  const { data: rows, error } = await db
    .from("messages")
    .select(`id, ${HISTORY_COLUMNS}`)
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(answering ? Math.max(limit * 3, 24) + 1 : limit * 3); // photos and dropped drafts never hide a returner
  if (error) throw new Error(`readLeadContext/history: ${error.message}`);
  const before = (rows ?? []).filter((m) => m.id !== answering);
  const newest = keptTurns(before).at(-1);
  const lastTurnAt = newest ? new Date(effectiveAt(newest)).toISOString() : null;
  return { history: assembleHistory(before, limit), lastTurnAt };
}

/** A deal row's facts as the receptionist and the phone read them: its stage, its service and its days. */
function dealRowFacts(d: Pick<DealFacts, "stage" | "service" | "proposed_at" | "decided_at" | "ended_at">): DealFacts {
  return {
    stage: d.stage,
    service: d.service,
    proposed_at: d.proposed_at,
    decided_at: d.decided_at,
    ended_at: d.ended_at,
  };
}

/**
 * The deal facts for a caller known by their number, or null: what the availability door needs and nothing more (0004),
 * in every workspace (0008, amended 18 Oct 2026). Every deal of theirs is read, because the current one may be the
 * oldest (see readLeadContext).
 */
export async function readDealForPhone(db: Db, tenantId: string, phoneE164: string): Promise<DealFacts | null> {
  const { data: c } = await db
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (!c) return null;
  const { data } = await db
    .from("deals")
    .select("stage, service, proposed_at, decided_at, ended_at, created_at")
    .eq("tenant_id", tenantId)
    .eq("contact_id", c.id)
    .order("created_at", { ascending: false });
  // A client of any service is a client (0029): their current deal may be a newer proposal for another one, which hid
  // that they are one, and they were offered a consultation instead of the service.
  const d = (data ?? []).find((x) => x.stage === "won") ?? pickCurrentDeal(data ?? []);
  return d ? dealRowFacts(d) : null;
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

export function describeLead(
  lead: LeadContext,
  now = new Date(),
  tz = "UTC",
  /** The channel of the conversation this is read in: the ask for the yes to offers is for WhatsApp alone. */
  channel?: LeadChannel,
): string {
  if (!lead.contactId) return "New contact — no prior history on record.";
  const bits: string[] = [];
  // A name may be one the person gave themselves (a WhatsApp profile name): capped, one line, and fenced as their words,
  // so it can say nothing to the model (contracts ai/fence.ts; the one injection policy).
  const name = promptSafeName(lead.name);
  const theirs = lead.standIn
    ? " That is the business they are at, not their own name: never call them by it, and ask who you are speaking with if it helps."
    : "";
  bits.push(name ? `Name on record: ${fencedInline("profile_name", name)}.${theirs}` : "No name on record.");
  // Whether an address is on file, so the receptionist asks for one only when there is none (booking rule ask_email);
  // a reader that never learned it (undefined) says nothing rather than a guess.
  if (lead.hasEmail === true) bits.push("Their email address is on file.");
  else if (lead.hasEmail === false) bits.push("No email address on file.");
  // What they answered about offers, whether they were asked for the yes, a text conversation said to be one, and one
  // already under way: the rules that ask for the yes once (contracts offers-ask.ts) and open by saying it is an
  // automated assistant (assistant-disclosure.ts) read these; a reader that never learned them says nothing.
  bits.push(
    ...offersFacts(lead, channel, now, tz),
    ...disclosureFacts({ returning: lead.returning, lastTurnAt: lead.lastSeenAt }, channel, now),
  );
  if (lead.returning) {
    const days = lead.lastSeenAt ? Math.floor((now.getTime() - new Date(lead.lastSeenAt).getTime()) / DAY_MS) : null;
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
  // Each other open deal of theirs (0029), its own sentence: a client of one service with a proposal out for another
  // hears both.
  const others = lead.otherDeals ?? [];
  for (const d of others) {
    const said = dealSentence(d, now.getTime(), tz, { hasLink: !!(d.proposal_url ?? "").trim() });
    if (said) bits.push(said);
  }
  const links = proposalLinkWords(lead);
  if (links) bits.push(links);
  return bits.join(" ");
}

/**
 * The owner's priced answer for this person is a link (00154), the deal's now (0008): the receptionist hands it over and
 * prices nothing itself, and no link is nothing said. With one deal open, its link answers a price question. With several
 * (0029), each link is named by its service and answers for that proposal alone: a client's engagement, and a proposal
 * out with no link, keep their own sentences (dealSentence), so a question about one never gets another's link.
 */
function proposalLinkWords(lead: LeadContext): string | null {
  const others = lead.otherDeals ?? [];
  const links = [
    { url: (lead.proposalUrl ?? "").trim(), service: lead.deal?.service ?? null },
    ...others
      .filter((d) => d.stage === "proposed")
      .map((d) => ({ url: (d.proposal_url ?? "").trim(), service: d.service })),
  ].filter((x) => x.url);
  const [first] = links;
  if (!first) return null;
  if (!others.length)
    return `The owner has a proposal ready for them at ${first.url}. If they ask about price, a quote or the proposal, send that link and state none of its figures; on a call, never read the address out — say it is being sent to them in writing.`;
  const rest =
    "and state none of its figures; a question about any other deal of theirs follows that deal's own sentence; on a call, never read an address out — say it is being sent to them in writing.";
  if (links.length === 1)
    return `The owner has a proposal${first.service ? ` for ${first.service}` : ""} ready for them at ${first.url}. If they ask about that proposal, its price or a quote for it, send that link ${rest}`;
  const named = links.map((x) => (x.service ? `${x.service} at ${x.url}` : x.url)).join("; ");
  return `The owner has proposals ready for them: ${named}. If they ask about one of these, its price or a quote for it, send the link for the one they mean (ask which, if it is not clear) ${rest}`;
}

/* -------------------------------------------------------------------------
 * The words a thread or a call said, found (00219).
 * ---------------------------------------------------------------------- */

/** A message that holds the words, or a call whose transcript does, as search_messages answers it. */
export interface MessageHit {
  /** A message (a call_summary among them), or a call found by its transcript. */
  kind: "message" | "call";
  /** The message's id, or the call's. */
  id: string;
  /** The thread it is on: a message always has one; a call may not. */
  conversationId: string | null;
  contactId: string | null;
  /** A message's channel; null for a call. */
  channel: string | null;
  direction: string;
  /** When it was sent, or when the call started (when it was recorded, where the call never said). */
  at: string;
  /** The words around the match, as written, with no markup. */
  snippet: string;
}

/** A hit's kind as the database spells it; anything else is a function this code was not written against. */
function hitKind(kind: string): MessageHit["kind"] {
  if (kind === "message" || kind === "call") return kind;
  throw new Error(`searchMessages: unknown kind ${kind}`);
}

/**
 * The workspace's messages and call transcripts that hold these words, newest first: none older than `since`, at most
 * `limit` (the database clamps it to 1–50). The words are websearch_to_tsquery's, so a quoted phrase, `or` and `-word`
 * mean what a search box means. Blank words, and words whose query could match a message holding none of them (only
 * exclusions, or an `or` with one: `valet or -parking`), answer nothing; so does a limit that is no number (NaN reaches
 * the database as null, and the function is strict). Under the caller's row security on a session client. A read that
 * fails THROWS, and so does a row of a kind this does not know: a search the database could not answer is never "nobody
 * said it", and a hit is never labelled what it is not.
 */
export async function searchMessages(
  db: Db,
  tenantId: string,
  words: string,
  since: Date,
  limit: number,
): Promise<MessageHit[]> {
  const { data, error } = await db.rpc("search_messages", {
    p_tenant: tenantId,
    p_words: words,
    p_since: since.toISOString(),
    p_limit: limit,
  });
  if (error) throw new Error(`searchMessages: ${error.message}`);
  // The generated row types every column as present; a call's channel, and a call's thread and person, may be null.
  return (data ?? []).map((r): MessageHit => ({
    kind: hitKind(r.kind),
    id: r.id,
    conversationId: r.conversation_id ?? null,
    contactId: r.contact_id ?? null,
    channel: r.channel ?? null,
    direction: r.direction,
    at: r.at,
    snippet: r.snippet ?? "",
  }));
}

/** What a message hit does not carry: who sent it, what became of it, and its kind. */
export interface MessageSender {
  id: string;
  /** customer, ai, human or system: who of the business wrote an outbound message, which its direction does not say. */
  sender: string;
  /** What became of it: a business message queued, canceled or failed never reached the customer. */
  status: string;
  /** text, template, media, call_summary (a call's note in its thread) or note. */
  type: string;
}

/**
 * What the provider (or the ledger) said about these FAILED messages: `messages.error`, by id, for the ones that say
 * something. newest_messages (00258), the Inbox's read of every thread's messages, answers twelve columns and error is
 * not one of them, so the reader asks for the few failed rows' errors here, in one read for a hundred ids or fewer
 * (IDS_PER_READ), under the caller's row security and the workspace's own filter. A read that fails THROWS.
 */
export async function failedMessageErrors(
  db: Db,
  tenantId: string,
  ids: readonly string[],
): Promise<Array<{ id: string; error: Record<string, unknown> }>> {
  const out: Array<{ id: string; error: Record<string, unknown> }> = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db
      .from("messages")
      .select("id, error")
      .eq("tenant_id", tenantId)
      .eq("status", "failed")
      .in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`failedMessageErrors: ${error.message}`);
    for (const r of data ?? [])
      if (r.error !== null && typeof r.error === "object" && !Array.isArray(r.error))
        out.push({ id: r.id, error: r.error });
  }
  return out;
}

/**
 * Who sent these messages and what became of them, by id, in one read for a hundred ids or fewer (IDS_PER_READ), under
 * the caller's row security and the workspace's own filter: a message the caller cannot read is not answered. A read
 * that fails THROWS.
 */
export async function messageSenders(db: Db, tenantId: string, ids: readonly string[]): Promise<MessageSender[]> {
  const out: MessageSender[] = [];
  for (let i = 0; i < ids.length; i += IDS_PER_READ) {
    const { data, error } = await db
      .from("messages")
      .select("id, sender, status, type")
      .eq("tenant_id", tenantId)
      .in("id", ids.slice(i, i + IDS_PER_READ));
    if (error) throw new Error(`messageSenders: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/**
 * Whether a reply names a message (`meta.reply_to`, written by the edge's sink and draft writer), in the message's own
 * thread, whatever became of it: one that left, a draft waiting or withdrawn (the owner's veto, a newer message's turn),
 * or one the wire refused. Any of them means the turn that answered the message reached its answer. Throws when it
 * cannot be read: a reply that could not be looked for is not one that is known to be missing.
 */
export async function repliedTo(db: Db, tenantId: string, conversationId: string, messageId: string): Promise<boolean> {
  const { data, error } = await db
    .from("messages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .eq("meta->>reply_to", messageId)
    .limit(1);
  if (error) throw new Error(`repliedTo: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * When the customer sent the message a reply answers (its `meta.reply_to`, in the reply's own thread), as the provider
 * stamped it or else as it came in (effectiveAt); for a reply that names none, or one no longer there, when the reply
 * itself was written; null for no reply to measure. What the send door measures a held draft's lateness from (core
 * deliver.ts). Throws when it cannot be read: a reply whose age could not be read is not one known to be on time.
 */
export async function replyAnswersAt(
  db: Db,
  p: { tenantId: string; conversationId: string; messageId?: string | null },
): Promise<number | null> {
  if (!p.messageId) return null;
  const { data: reply, error } = await db
    .from("messages")
    .select("created_at, meta")
    .eq("tenant_id", p.tenantId)
    .eq("id", p.messageId)
    .maybeSingle();
  if (error) throw new Error(`replyAnswersAt: ${error.message}`);
  if (!reply) return null;
  const answers = (reply.meta as { reply_to?: unknown } | null)?.reply_to;
  if (typeof answers !== "string" || !answers) return Date.parse(reply.created_at);
  const { data: asked, error: askedError } = await db
    .from("messages")
    .select("channel_ts, created_at")
    .eq("tenant_id", p.tenantId)
    .eq("conversation_id", p.conversationId)
    .eq("id", answers)
    .maybeSingle();
  if (askedError) throw new Error(`replyAnswersAt: ${askedError.message}`);
  return effectiveAt(asked ?? { channel_ts: null, created_at: reply.created_at });
}

/**
 * Whether a text of ours has ever reached the person on this thread: what decides the line the first text to a number
 * carries (the rates, STOP and HELP the campaign's filing promises). readThreadState answers it for the receptionist;
 * this asks the same of the same rows for a conversation a member begins (core conversations/begin.ts).
 */
export async function textReached(db: Db, tenantId: string, conversationId: string): Promise<boolean> {
  const { data, error } = await db
    .from("messages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .eq("channel", "sms")
    .in("status", DELIVERED)
    .limit(1);
  if (error) throw new Error(`textReached: ${error.message}`);
  return (data ?? []).length > 0;
}

/**
 * A member opens a person's one thread (conversation_open, 00351), as themselves: the thread's id, made when they had
 * none. The door's refusals are thrown as they came (a person who is not this workspace's, or gone).
 */
export async function openConversation(db: Db, tenantId: string, contactId: string): Promise<string> {
  const { data, error } = await db.rpc("conversation_open", { p_tenant_id: tenantId, p_contact_id: contactId });
  if (error) throw error;
  if (typeof data !== "string" || !data) throw new Error("conversation_open: the door answered no thread");
  return data;
}

/**
 * The wire the business's own written words last went by on one thread, or null when it has written none: what a
 * thread nothing has come to is answered on (contracts answerWireOf says the same of the messages a page holds).
 */
export async function ourLastWire(db: Db, tenantId: string, conversationId: string): Promise<string | null> {
  const { data, error } = await db
    .from("messages")
    .select("channel")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .in("type", ["text", "template", "media"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`reading the last outbound: ${error.message}`);
  return data?.channel ?? null;
}
