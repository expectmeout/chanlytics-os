import { recordOrNull } from "../shared/unknown";
import { REPLY_WINDOW_MS } from "./run-words";

/**
 * The answer to a campaign run: a yes or a stop (the consent ledger's `contact.consent_changed`, 00013) that a run's
 * message earned. One rule, said here once: the run sheet reads it (server/campaigns/broadcasts.ts, consentAfter), and
 * `public.campaign_answers` (00403) restates it in SQL for Reports › Campaigns and the Campaigns home, which a database
 * test holds equal to this over one world. The People lens keeps every yes and stop; this is the part of them a run
 * is owed.
 *
 * An event counts only if `data.consent` is `opted_in` or `opted_out` and `data.source` is not `merge` or `stop` (a
 * merge restates the kept person's consent, a stop ends a yes: neither is the person answering); an event that names
 * no source counts. Its purpose is `email_marketing`, `marketing`, or `conversational` (any other). A send whose person
 * is not live never has an answer.
 *
 * Which run an event answers is told by a key where it carries one that names a send, else by the clock.
 * - **Exact.** An unsubscribe, a complaint or a reply no (purpose `email_marketing`, consent `opted_out`, source
 *   `unsubscribe`, `complaint` or `reply`) names the outbound email by `data.message_id`; an event of source `carrier` or
 *   `whatsapp`, of either consent (the rule does not ask `opted_out` of it), names the refused send by
 *   `data.message_external_id`. Such an event belongs to the send of the same person whose `messageId` or
 *   `messageExternalId` it names, whenever it came, and to no other run; a key that finds no send of the same person
 *   belongs to no run (it answers something else: an Inbox email, a thread's text, another person's email).
 *   - **A key is a word.** It is a JSON string that is not `''`, compared as text, exactly and case-sensitively: in SQL
 *     `messages.id::text = data->>'message_id'` (never a cast of the key to a uuid, which would turn a key that is not
 *     one into no key) and `messages.external_id = data->>'message_external_id'`, each read only where
 *     `jsonb_typeof(...) = 'string'`. A number, an object, a missing key or `''` is no key, and then the event is
 *     attributed by time; so is an event of a kind that names no key (a desk yes, an opt-in by email, an unsubscribe of
 *     another purpose, a source that is neither of the three nor `carrier`/`whatsapp`), whatever else it carries.
 * - **By time.** Every other event belongs to each send of the same person with `sentAt < at <= sentAt + REPLY_WINDOW_MS`,
 *   an `email_marketing` event only to a send that went `byEmail`.
 *
 * Per run, the answer of a person is the latest event attributed to it (by `at`, then `eventId`).
 *
 * Instants are compared at millisecond precision, both sides truncated to the millisecond (here `Date.parse`; in SQL
 * `date_trunc('milliseconds', ...)` on the event's `at` and on `sent_at`, for the window and for "the latest"). Two events at
 * the same millisecond are ordered by the greater event id as text, which for the lowercase uuids the ledger keeps is
 * uuid order.
 */

/** A campaign send, as the rule reads one: a recipient the run reached (state `sent`). */
export interface AnswerSend {
  runId: string;
  contactId: string;
  sentAt: string;
  /** Reached by email: an answer about offers by email is theirs to give it, and nobody else's. */
  byEmail: boolean;
  /** The person stands: not erased, not merged into another. */
  live: boolean;
  /** The outbound email it was (`broadcast_recipients.message_id`), where one was written. */
  messageId: string | null;
  /** The provider's id for its message (`messages.external_id`), which a carrier's or WhatsApp's stop names. */
  messageExternalId: string | null;
}

/** A `contact.consent_changed` event: whose, when, and `data` as the ledger keeps it. */
export interface AnswerEvent {
  id: string;
  contactId: string;
  at: string;
  data: unknown;
}

/** Which question a person's answer was to: offers, offers by email (their own answer, 00174), or everything. */
export type AnswerPurpose = "marketing" | "email_marketing" | "conversational";

/** What a person answered a run: the latest event that was theirs to give it. */
export interface RunAnswer {
  runId: string;
  contactId: string;
  consent: "opted_in" | "opted_out";
  purpose: AnswerPurpose;
  at: string;
  eventId: string;
  /** Found by a key the event carries, not by the clock. */
  exact: boolean;
}

/** A send's field a key is read against, and the word the event named. */
interface AnswerKey {
  field: "messageId" | "messageExternalId";
  value: string;
}

/** An event that counts, read once. */
interface CountedEvent {
  id: string;
  contactId: string;
  at: string;
  atMs: number;
  consent: RunAnswer["consent"];
  purpose: AnswerPurpose;
  key: AnswerKey | null;
}

/** The sources that are not a person answering. */
const NOT_ANSWERS: ReadonlySet<string> = new Set(["merge", "stop"]);
/** The sources whose stop names the outbound email (`message_id`) and the ones that name the refused send. */
const NAMES_THE_EMAIL: ReadonlySet<string> = new Set(["unsubscribe", "complaint", "reply"]);
const NAMES_THE_SEND: ReadonlySet<string> = new Set(["carrier", "whatsapp"]);

const isIn = (set: ReadonlySet<string>, source: unknown): boolean => typeof source === "string" && set.has(source);

/** A key's word: a string with something in it, exactly as it was written. */
const wordOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** The offers door names its purpose (00095, 00174); the conversational one names none. */
function purposeOf(named: unknown): AnswerPurpose {
  return named === "email_marketing" || named === "marketing" ? named : "conversational";
}

/** The key an event carries that names a send, of its own kind; none for any other event. */
function keyOfEvent(data: Record<string, unknown>, consent: string, purpose: AnswerPurpose): AnswerKey | null {
  const asEmail = purpose === "email_marketing" && consent === "opted_out" && isIn(NAMES_THE_EMAIL, data.source);
  const email = asEmail ? wordOrNull(data.message_id) : null;
  if (email) return { field: "messageId", value: email };
  const send = isIn(NAMES_THE_SEND, data.source) ? wordOrNull(data.message_external_id) : null;
  return send ? { field: "messageExternalId", value: send } : null;
}

/** An event as the rule counts it, or null when it is no answer (what it says, whether it has a place in time). */
function countedOf(e: AnswerEvent): CountedEvent | null {
  const data = recordOrNull(e.data);
  const atMs = Date.parse(e.at);
  if (!data || !Number.isFinite(atMs) || isIn(NOT_ANSWERS, data.source)) return null;
  const consent = data.consent;
  if (consent !== "opted_in" && consent !== "opted_out") return null;
  const purpose = purposeOf(data.purpose);
  return {
    id: e.id,
    contactId: e.contactId,
    at: e.at,
    atMs,
    consent,
    purpose,
    key: keyOfEvent(data, consent, purpose),
  };
}

/** The person's sends a key names: whenever the event came. */
const namedBy = (key: AnswerKey, sends: readonly AnswerSend[]): AnswerSend[] =>
  sends.filter((s) => s[key.field] === key.value);

/** The person's sends an event falls after, inside the reply window; an offer by email only the ones that went by email. */
function reachedBefore(e: CountedEvent, sends: readonly AnswerSend[]): AnswerSend[] {
  return sends.filter((s) => {
    const sentMs = Date.parse(s.sentAt);
    const inside = sentMs < e.atMs && e.atMs - sentMs <= REPLY_WINDOW_MS;
    return inside && (e.purpose !== "email_marketing" || s.byEmail);
  });
}

/** Whether `a` is the later of two events: by when (to the millisecond), then by the greater id as text. */
const isLaterEvent = (a: CountedEvent, b: CountedEvent): boolean => (a.atMs !== b.atMs ? a.atMs > b.atMs : a.id > b.id);

/** What stands for a run and a person so far. */
interface Standing {
  runId: string;
  event: CountedEvent;
  exact: boolean;
}

/**
 * What each person answered each run: for every `(runId, contactId)` that has one, a row; in no promised order, and the
 * same rows whatever the order of `sends` and `events`.
 */
export function answersToRuns(sends: readonly AnswerSend[], events: readonly AnswerEvent[]): RunAnswer[] {
  const sendsOf = new Map<string, AnswerSend[]>();
  for (const s of sends) {
    if (!s.live) continue;
    const had = sendsOf.get(s.contactId);
    if (had) had.push(s);
    else sendsOf.set(s.contactId, [s]);
  }
  const standing = new Map<string, Standing>();
  for (const raw of events) {
    const e = countedOf(raw);
    const theirs = e ? sendsOf.get(e.contactId) : undefined;
    if (!e || !theirs) continue;
    const exact = e.key !== null;
    for (const s of e.key ? namedBy(e.key, theirs) : reachedBefore(e, theirs)) {
      const slot = JSON.stringify([s.runId, s.contactId]);
      const held = standing.get(slot);
      if (!held || isLaterEvent(e, held.event)) standing.set(slot, { runId: s.runId, event: e, exact });
    }
  }
  return [...standing.values()].map(({ runId, event: e, exact }) => ({
    runId,
    contactId: e.contactId,
    consent: e.consent,
    purpose: e.purpose,
    at: e.at,
    eventId: e.id,
    exact,
  }));
}
