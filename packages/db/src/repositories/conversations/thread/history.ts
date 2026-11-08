/** Thread: history. */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type DealFacts,
  DAY_MS,
  dealIsOpen,
  isOneOf,
  pickCurrentDeal,
  proposalLinkOf,
  type SchemaSet,
  recordOrEmpty,
} from "@chanlytics/contracts";
import type { Database } from "../../../types";
import { saysMissing } from "../../../shared/missing-door";
import { dbLog } from "../../../shared/observe";

export type Db = SupabaseClient<Database>;

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
}

/** Outbound rows only count as memory once they actually left. A canceled or
 *  failed send was never seen by the customer, so it must not appear in the
 *  model's context as something "we said". */
export const DELIVERED: SchemaSet<"messages.status">[] = ["sent", "delivered", "read"];

/**
 * Voice notes moved in from before the database, as ordinary assistant turns.
 * Every one of them is now ALSO a native call_summary row written by the Retell
 * webhook, so leaving both in would show the model each call twice — in two
 * different formats — and it would reasonably conclude the customer phoned
 * twice as often as they did. The native row is canonical; this is the copy.
 */
const IMPORTED_CALL_NOTE = /^\[voice call note /;

const isBackfill = (m: { meta?: unknown }): boolean =>
  !!m.meta && typeof m.meta === "object" && recordOrEmpty(m.meta).backfill === true;

/** "Got it, a person will look" is a courtesy, not an answer: it must not spend the cap that stops loops. */
const isAcknowledgement = (m: { meta?: unknown }): boolean =>
  !!m.meta && typeof m.meta === "object" && recordOrEmpty(m.meta).ack === true;

/** True event time. A backfilled row has no channel_ts and its created_at is
 *  when the IMPORT ran, so it can only ever be placed approximately. */
export const effectiveAt = (m: { channel_ts: string | null; created_at: string }): number =>
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
    if (m.direction === "outbound" && !isOneOf(DELIVERED, m.status)) return false;
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

  const [recent, replies, texted] = await Promise.all([
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
  ]);

  if (recent.error) throw new Error(`readThreadState/history: ${recent.error.message}`);
  if (replies.error) throw new Error(`readThreadState/replies: ${replies.error.message}`);
  if (texted.error) throw new Error(`readThreadState/texted: ${texted.error.message}`);

  const history = assembleHistory(recent.data ?? [], historyLimit);

  return {
    history,
    textedBefore: (texted.data ?? []).length > 0,
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
   * The channels that yes covers (contacts.marketing_channels, consent/channels.ts): null where none are kept, a yes
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
  /\b(offers_asked_at|marketing_channels)\b/.test(message) && saysMissing(message);

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
  personName: string | { contactId: string }, // the number they write from; on a wire with none (a DM), their own row
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
    .eq(
      typeof personName === "string" ? "phone_e164" : "id",
      typeof personName === "string" ? personName : personName.contactId,
    )
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
      .eq(
        typeof personName === "string" ? "phone_e164" : "id",
        typeof personName === "string" ? personName : personName.contactId,
      )
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
  const { data: dealRows, error: dErr } = await db
    .from("deals")
    .select("stage, service, proposed_at, decided_at, ended_at, created_at, proposal_url")
    .eq("tenant_id", tenantId)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false });
  if (dErr) dbLog().warn("deal_context_read_failed", { tenant_id: tenantId, error: dErr.message });
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
  // A context lookup never costs the reply (readLeadContext): a read that fails is no deal, and said.
  const { data: c, error: cErr } = await db
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone_e164", phoneE164)
    .maybeSingle();
  if (cErr) dbLog().warn("deal_context_read_failed", { tenant_id: tenantId, error: cErr.message });
  if (!c) return null;
  const { data, error } = await db
    .from("deals")
    .select("stage, service, proposed_at, decided_at, ended_at, created_at")
    .eq("tenant_id", tenantId)
    .eq("contact_id", c.id)
    .order("created_at", { ascending: false });
  if (error) dbLog().warn("deal_context_read_failed", { tenant_id: tenantId, error: error.message });
  // A client of any service is a client (0029): their current deal may be a newer proposal for another one, which hid
  // that they are one, and they were offered a consultation instead of the service.
  const item = (data ?? []).find((x) => x.stage === "won") ?? pickCurrentDeal(data ?? []);
  return item ? dealRowFacts(item) : null;
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
