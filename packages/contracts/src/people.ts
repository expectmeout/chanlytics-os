import { agoWords } from "./time";
import { clockDate, clockDateYear, clockDayLabel, clockTime } from "./clock";
import { standingOf, type StandingVerdict } from "./standing";
/**
 * People — the relationship record for a business whose receptionist is an AI.
 *
 * A sales CRM's contact is a form: name, company, title, owner. Here the
 * customer record is a timeline: what they said, what the receptionist
 * answered, when a human stepped in, whether they phoned. Every field on
 * these view models is a column fact or a count over columns, never a score.
 *
 * The six states are the product's vocabulary for "where do I matter",
 * evaluated in a fixed order so a person is in exactly one. Each is a fact:
 * an open escalation, who owns the thread and who spoke last, a STOP, the
 * evidence-based first contact, recency.
 */
import { formatPhoneDisplay } from "./phone";
import { personName } from "./person-name";
import { mayMessageFor, type ConsentChange, type SendPurpose } from "./consent";
import { replyWindow, waWindow } from "./policy";
import { tidyCallSummary } from "./call-words";
import { visitDateKey, visitDay, visitLine, visitTime, type PersonVisitsDto } from "./calendar-people";
import {
  initialsOf,
  isIdentifierName,
  writtenChannelOf,
  messageAt,
  messageText,
  messageWords,
  shortTime,
  type CallDto,
  type ConversationDto,
  type MessageDto,
} from "./viewmodels";

/* --------------------------------- DTOs ---------------------------------- */

/** One row of `people_list(tenant, contact?)`. Every column is nullable on
 *  the wire (RETURNS TABLE), so readers coalesce. */
export interface PersonRowDto {
  id: string;
  display_name: string | null;
  wa_profile_name: string | null;
  phone_e164: string | null;
  /** As normalizeEmail stores it (00125). A person may have this and no number. */
  email: string | null;
  consent: string | null;
  consent_source: string | null;
  marketing_consent?: string | null;
  marketing_consent_source?: string | null;
  marketing_consent_updated_at?: string | null;
  consent_updated_at: string | null;
  dnc: boolean | null;
  channels: string[] | null;
  conversation_count: number | null;
  escalation_count: number | null;
  needs_human: boolean | null;
  open_escalation_reason: string | null;
  open_escalation_since: string | null;
  latest_conversation_id: string | null;
  latest_state: string | null;
  latest_paused_until: string | null;
  latest_assignee_user_id: string | null;
  latest_snooze_until: string | null;
  latest_wa_inbound_at: string | null;
  last_message_at: string | null;
  last_message_direction: string | null;
  last_message_sender: string | null;
  last_inbound_text: string | null;
  last_inbound_at: string | null;
  last_call_at: string | null;
  /** The last call THEY placed — the one that means they reached out. */
  last_inbound_call_at?: string | null;
  /** What they wanted from that call in the analysis's plain words, else the
   *  provider's summary; null until the call is analysed. */
  last_inbound_call_summary?: string | null;
  call_count: number | null;
  call_seconds: number | null;
  /** Earliest REAL event time: a dated message or a call. Null when the only
   *  history is an undated import. */
  first_contact_at: string | null;
  /** Earliest row we hold, whatever it dates — the import moment for a
   *  backfilled person. The floor for "before …". */
  earliest_row_at: string | null;
  has_backfill: boolean | null;
  has_chat: boolean | null;
  /** The wires their written words travelled: whatsapp, sms, email (00127). Absent on a row read before it. */
  message_channels?: string[] | null;
  queued_reply_at: string | null;
  /** Where they first came from (00138): calendar | lead | manual | import | call | whatsapp | sms | email, or null
   *  when nothing says. In words through cameFromOf; absent on a row read before the column existed. */
  came_from?: string | null;
  /** The reply mode in force for this person — their own setting, else the
   *  workspace's. Attached by the API from the policies table; people_list
   *  does not carry it. */
  effective_reply_mode?: string | null;
  /** Their appointments on the owner's calendar, attached by the API when the
   *  workspace has one connected; null means no calendar. */
  visits?: PersonVisitsDto | null;
}

export interface PersonIdentityDto {
  channel: string;
  external_id: string;
  created_at: string;
}

export interface PersonEscalationDto {
  id: string;
  conversation_id: string;
  reason: string;
  state: string;
  details: string | null;
  created_at: string;
  updated_at: string;
  resolved_by_user_id: string | null;
}

export interface PersonDecisionDto {
  id: string;
  verb: string;
  subject_type: string;
  subject_id: string;
  actor_type: string;
  actor_user_id: string | null;
  created_at: string;
  payload: Record<string, unknown> | null;
}

export interface PersonDetailDto {
  row: PersonRowDto;
  identities: PersonIdentityDto[];
  conversations: ConversationDto[];
  calls: CallDto[];
  escalations: PersonEscalationDto[];
  decisions: PersonDecisionDto[];
  /** This person's own receptionist mode, or null to follow the workspace. */
  receptionist_mode?: string | null;
  /** The workspace's reply policy mode, for the "following …" hint. */
  workspace_reply_mode?: string | null;
  /** Their appointments on the owner's calendar, when the workspace has one connected. */
  visits?: PersonVisitsDto;
  /** How they came to be in People when it was not by writing or calling: the calendar sweep, or a hand. */
  added?: { at: string; source: string; title: string | null };
  /** The owner's notes on this person — the receptionist reads them. */
  notes?: string | null;
  /** The workspace's booking link, for the profile's one-step send. */
  booking_link?: string | null;
  /** Every change to either answer, newest first: the ledger rows (contact.consent_changed), as evidence. */
  consent_history?: ConsentChange[];
}

/** What an owner may set for one person: answer, ask first, or stay out. */
export type PersonMode = "auto" | "ask" | "never";
export const PERSON_MODES: readonly PersonMode[] = ["auto", "ask", "never"];
export const PERSON_MODE_LABELS: Record<PersonMode, string> = { auto: "Answer", ask: "Ask me first", never: "Never" };
/**
 * Every word for the receptionist's mode for one person, following the workspace included. The profile,
 * the bulk menu, a pill and an Ask receipt all say these: the mode was worded four ways on one journey
 * (Answer and Answer them, Never and Stay out, "Use the workspace setting" and "Follow the workspace").
 */
export const PERSON_MODE_WORDS: Record<PersonMode | "inherit", string> = { ...PERSON_MODE_LABELS, inherit: "Follow the workspace" };

export function asPersonMode(s: string | null | undefined): PersonMode | null {
  return s && (PERSON_MODES as readonly string[]).includes(s) ? (s as PersonMode) : null;
}

/* -------------------------------- states --------------------------------- */

export type PersonState = "needs_you" | "waiting_on_you" | "opted_out" | "new" | "quiet" | "active";

export const PERSON_STATE_LABELS: Record<PersonState, string> = {
  needs_you: "Needs you",
  waiting_on_you: "Waiting on you",
  opted_out: "Opted out",
  new: "New",
  quiet: "Quiet",
  active: "Active",
};

/** The list's tabs: the states, in the order the rule evaluates them. */
export const PEOPLE_TABS: readonly { id: "all" | PersonState; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs_you", label: "Needs you" },
  { id: "waiting_on_you", label: "Waiting on you" },
  { id: "new", label: "New" },
  { id: "quiet", label: "Quiet" },
  { id: "active", label: "Active" },
];

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
/** First contact this recent, with no imported history, is "new". */
export const NEW_WINDOW_MS = 7 * DAY_MS;
/** Nothing heard for this long is "quiet". */
export const QUIET_AFTER_MS = 30 * DAY_MS;

/**
 * The escalation reasons in the words an owner uses across a table row.
 * ESCALATION_REASON_LABELS in viewmodels are sentences for Today's headlines;
 * these are clauses that follow "Escalated, …".
 */
const REASON_SHORT: Record<string, string> = {
  human_token: "asked for a person",
  non_text: "sent something the receptionist can't read",
  refusal: "the receptionist declined to answer",
  rate_cap: "reply limit reached",
  policy_block: "held by your reply setting",
  policy_ask: "a booking or a question set to Ask me first",
  person_hold: "held for you",
  carriers: "waiting on carriers",
  email_review: "wrote by email",
  send_failed: "a reply failed to send",
  deadman: "no answer in time",
  brain_error: "the receptionist hit an error",
  manual: "flagged by you",
  opt_out: "asked to stop",
  state_unavailable: "memory was unavailable",
  stale: "message arrived late",
  callback: "needs a call back",
  budget: "the day’s model budget is spent",
  paused: "billing is paused",
};

export function reasonShort(reason: string | null | undefined): string {
  if (!reason) return "";
  return REASON_SHORT[reason] ?? reason.replace(/_/g, " ");
}

/* ------------------------------- helpers --------------------------------- */

const ts = (iso: string | null | undefined): number | null => (iso ? new Date(iso).getTime() : null);

/**
 * "Jul 14", or "Jul 14, 2025" once it is not this year, by the business's
 * calendar (clock.ts). Every day and time on a person is said in the workspace's
 * zone: these formatters had none, so the browser's zone decided which day a
 * message was on (the 12 September audit's D5).
 */
function fmtDate(ms: number, tz: string, nowMs: number): string {
  return clockDate(ms, tz, nowMs);
}

/** "just now" · "5m ago" · "3h ago" · "2d ago", the business's date past a week — the one family (time.ts, clock.ts). */
export function ago(ms: number, tz: string, nowMs: number): string {
  return agoWords(ms, nowMs, { dateAfterMs: WEEK_MS, date: (at) => clockDate(at, tz, nowMs) });
}

/** When they were last in contact, by message or by call, whichever is later. */
function lastContactTs(r: PersonRowDto): number | null {
  const m = ts(r.last_message_at);
  const k = ts(r.last_call_at);
  return m === null ? k : k === null ? m : Math.max(m, k);
}

function mmss(ms: number | null | undefined): string | undefined {
  if (ms == null || ms <= 0) return undefined;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

// What to call a person is person-name.ts's one rule; People reads it from there
// like every other surface, and the index exports it from there.
export { personName };

export type PersonChannel = "whatsapp" | "sms" | "voice" | "email";

/**
 * Channels are what actually happened, not only what identities record.
 * Production has a backfilled contact whose only identity row is 'voice'
 * and whose WhatsApp transcript is right there in messages; the glyphs must
 * not say "phone only" about them.
 */
function channelsOf(r: PersonRowDto): PersonChannel[] {
  const set = new Set<string>(r.channels ?? []);
  // Which wires their words travelled (00127). A row read without it has
  // written words and no way to say where, and until email every written word
  // was WhatsApp's or a text's, which share a glyph.
  //
  // A text is its own wire now, not WhatsApp's: they share a glyph and nothing
  // else -- no window, no templates, a different number -- and a person who had
  // only ever texted was introduced as "WhatsApp" at the top of their page.
  const wrote = r.message_channels;
  if (wrote ? wrote.includes("whatsapp") : r.has_chat) set.add("whatsapp");
  if (wrote?.includes("sms")) set.add("sms");
  if (wrote?.includes("email")) set.add("email");
  if ((r.call_count ?? 0) > 0) set.add("voice");
  const order: PersonChannel[] = ["whatsapp", "sms", "voice", "email"];
  return order.filter((c) => set.has(c));
}

/**
 * The wire a reply to this row's person goes out on, as far as a ROW can say.
 *
 * A row knows which wires they have written on and not which one was last, so
 * this is exact for the one case that matters most -- a person reached only by
 * email, whose reply can never be held by WhatsApp's window -- and otherwise
 * reads WhatsApp's window, the strictest there is: a row that cannot tell may
 * say a reply is held when it is not, and never the reverse. The profile, which
 * has every message, answers it exactly (replyChannelOfThreads).
 */
function replyChannelOfRow(r: PersonRowDto): "whatsapp" | "sms" | "email" | null {
  if (!r.has_chat) return null;
  const wrote = r.message_channels;
  if (wrote && wrote.includes("email") && !wrote.some((c) => c === "whatsapp" || c === "sms")) return "email";
  return "whatsapp";
}

/** The wire a reply goes out on, exactly: where they last wrote (the reply route's own rule, verbs replyChannelOf). */
function replyChannelOfThreads(conversations: ReadonlyArray<ConversationDto>): "whatsapp" | "sms" | "email" | null {
  let latest: { at: number; channel: string | null | undefined } | null = null;
  for (const c of conversations) {
    for (const m of c.messages) {
      if (m.sender !== "customer" || m.type === "call_summary") continue;
      const at = Date.parse(m.channel_ts ?? m.created_at);
      if (Number.isFinite(at) && (!latest || at > latest.at)) latest = { at, channel: m.channel };
    }
  }
  return latest ? writtenChannelOf(latest.channel) : null;
}

/**
 * What the booking-link button says, by the wire a reply goes out on.
 *
 * Nothing is sent from the button: it opens the thread with the link ready in
 * the composer, or, where WhatsApp's window has shut, lets the thread offer the
 * approved template. Three pages carried their own two-way copy of these words,
 * so on an email-only person they read "Text the booking link" -- and before
 * the window was channel-aware, "Send the booking-link template", a template
 * that person cannot receive. `ready` is whether the composer may be filled.
 */
export function bookingLinkAction(
  replyVia: "WhatsApp" | "Text" | "Email" | null,
  win: { open: boolean; hoursLeft: number } | null,
): { label: string; title: string; ready: boolean } {
  if (replyVia === "Email") return { label: "Email the booking link", title: "Opens the thread with the link ready to send by email", ready: true };
  if (replyVia === "Text") return { label: "Text the booking link", title: "Opens the thread with the link ready to send as a text", ready: true };
  if (win && win.open) return { label: "Text the booking link", title: `Opens the thread with the link ready to send · ${win.hoursLeft}h left in their reply window`, ready: true };
  return {
    label: "Send the booking-link template",
    title: "Their reply window is closed — the thread offers the approved booking-link template, the one thing WhatsApp delivers outside it",
    ready: false,
  };
}

/** How a reply goes, in the words the page uses for the wire. */
const REPLY_VIA: Record<"whatsapp" | "sms" | "email", "WhatsApp" | "Text" | "Email"> = { whatsapp: "WhatsApp", sms: "Text", email: "Email" };

/** A channel in the owner's words. */
export const PERSON_CHANNEL_WORDS: Record<PersonChannel, string> = { whatsapp: "WhatsApp", sms: "Text", voice: "Phone", email: "Email" };

/**
 * Where a person first came from, as people_list decides it once (00138): the
 * door that added them (calendar, lead, manual), an imported history (import),
 * else their first call (call) or the wire of their first message (whatsapp,
 * sms, email). People's "Came from" column says it in these words; a stored
 * value is never shown.
 */
export type PersonCameFrom = "whatsapp" | "sms" | "email" | "call" | "calendar" | "manual" | "import" | "lead";

/** The words for each, once: the three wires say what a reply on them says (REPLY_VIA), and a call says what its glyph says (PERSON_CHANNEL_WORDS.voice). */
export const PERSON_CAME_FROM_WORDS: Record<PersonCameFrom, string> = {
  whatsapp: REPLY_VIA.whatsapp,
  sms: REPLY_VIA.sms,
  email: REPLY_VIA.email,
  call: PERSON_CHANNEL_WORDS.voice,
  calendar: "Your calendar",
  manual: "Added by hand",
  import: "Imported history",
  lead: "A lead you found",
};

/** A row's came_from in words, or null: nothing known, a row read before 00138, or a value this build does not know. */
export function cameFromOf(r: { came_from?: string | null }): { key: PersonCameFrom; label: string } | null {
  const k = r.came_from;
  if (!k || !Object.prototype.hasOwnProperty.call(PERSON_CAME_FROM_WORDS, k)) return null;
  return { key: k as PersonCameFrom, label: PERSON_CAME_FROM_WORDS[k as PersonCameFrom] };
}

type StandingRow = Pick<PersonRowDto, "latest_state" | "latest_paused_until" | "latest_assignee_user_id" | "needs_human" | "open_escalation_reason">;

/** The latest thread's standing, from the one rule every surface reads (standing.ts). */
export function personStanding(r: StandingRow, nowMs: number): StandingVerdict {
  return standingOf({
    state: r.latest_state === "snoozed" ? "snoozed" : r.needs_human || r.latest_state === "needs_human" ? "needs_human" : (r.latest_state ?? "open"),
    paused_until: r.latest_paused_until,
    assignee_user_id: r.latest_assignee_user_id,
    open_escalation: !!r.open_escalation_reason,
  }, nowMs);
}

/** A person has the thread: they claimed it, or their own reply paused the receptionist. */
export function isOwned(r: StandingRow, nowMs: number): boolean {
  return !!r.latest_assignee_user_id || personStanding(r, nowMs).takenOver;
}

/* ------------------------------ the rule --------------------------------- */

export function personStateFor(r: PersonRowDto, nowMs: number): PersonState {
  const v = personStanding(r, nowMs);
  const owned = !!r.latest_assignee_user_id || v.takenOver;
  // One rule for the Inbox, People and Today (standing.ts): a thread someone
  // has taken over is theirs, a snoozed one is for later, and the
  // receptionist's own pause on a handoff is nobody's — it still needs you.
  if (v.standing === "needs_you") return "needs_you";
  if (owned && (v.flagged || r.last_message_direction === "inbound")) return "waiting_on_you";
  if (r.consent === "opted_out" || r.dnc) return "opted_out";
  const first = ts(r.first_contact_at);
  if (!r.has_backfill && first !== null && nowMs - first <= NEW_WINDOW_MS) return "new";
  const last = lastContactTs(r);
  if (last === null || nowMs - last > QUIET_AFTER_MS) return "quiet";
  return "active";
}

/* ------------------------------ row facts -------------------------------- */

export interface PersonLastContact {
  ts: number | null;
  at: string | null;
  kind: "message" | "call" | null;
  who: "they" | "receptionist" | "you" | "system" | null;
  /** "They wrote · 2h ago" */
  label: string;
}

function lastContactOf(r: PersonRowDto, tz: string, nowMs: number): PersonLastContact {
  const m = ts(r.last_message_at);
  const k = ts(r.last_call_at);
  if (m === null && k === null) return { ts: null, at: null, kind: null, who: null, label: "No contact recorded" };
  if (k !== null && (m === null || k > m)) {
    return { ts: k, at: r.last_call_at, kind: "call", who: "they", label: `Phoned · ${ago(k, tz, nowMs)}` };
  }
  const who: PersonLastContact["who"] =
    r.last_message_direction === "inbound" ? "they"
    : r.last_message_sender === "human" ? "you"
    : r.last_message_sender === "ai" ? "receptionist"
    : "system";
  const verb =
    who === "they" ? "They wrote" : who === "you" ? "You replied" : who === "receptionist" ? "Receptionist replied" : "We sent";
  return { ts: m as number, at: r.last_message_at, kind: "message", who, label: `${verb} · ${ago(m as number, tz, nowMs)}` };
}

export interface PersonFirstContact {
  ts: number | null;
  /** "Jul 14", "Before Aug 27", or "—" */
  label: string;
  /** True when the only history is an undated import: we know a floor, not a date. */
  estimate: boolean;
  /** True when this date may count as "new" (no imported history). */
  evidence: boolean;
}

function firstContactOf(r: PersonRowDto, tz: string, nowMs: number): PersonFirstContact {
  const f = ts(r.first_contact_at);
  if (f !== null) return { ts: f, label: fmtDate(f, tz, nowMs), estimate: false, evidence: !r.has_backfill };
  const e = ts(r.earliest_row_at);
  if (e !== null && r.has_backfill) return { ts: e, label: `Before ${fmtDate(e, tz, nowMs)}`, estimate: true, evidence: false };
  if (e !== null) return { ts: e, label: fmtDate(e, tz, nowMs), estimate: false, evidence: !r.has_backfill };
  return { ts: null, label: "—", estimate: true, evidence: false };
}

export interface PersonConsent {
  state: "unknown" | "opted_in" | "opted_out";
  dnc: boolean;
  label: string;
  sub: string;
  /** How the answer was given, raw: in_person | phone | form | customer_message | operator | null. */
  source: string | null;
  /**
   * The OTHER answer: offers, specifically.
   *
   * Separate because the carriers require it separate (error 30913) and because
   * the two mean different things -- a person can want to hear about their own
   * appointment and not want to hear about a sale. An opt-out or a do-not-call
   * on the main answer overrides this one; the reverse does not.
   */
  marketing: "unknown" | "opted_in" | "opted_out";
  marketingSource: string | null;
  /** One line for the person's profile: what they said about offers, and when. */
  marketingSub: string;
  /** The offers answer in a word, as People's Offers column says it: Yes, No or Not asked. */
  marketingLabel: string;
}

/**
 * How a customer's answer about marketing messages was given. The ingest
 * writes 'customer_message' for STOP and START; a person at the desk picks
 * one of these four. 'operator' is the reset to "not asked" and is never
 * offered as a source.
 */
export const CONSENT_SOURCES: readonly { id: string; label: string }[] = [
  { id: "in_person", label: "In person" },
  { id: "phone", label: "On the phone" },
  { id: "form", label: "Sign-up form" },
  { id: "customer_message", label: "Their own message" },
];
export const CONSENT_RESET_SOURCE = "operator";

/**
 * The ways a yes to OFFERS may have been given: in writing, and only in writing.
 *
 * Promotional texts need the customer's express WRITTEN consent. The carriers
 * refuse a campaign whose opt-in "relies on verbal consent instead of written
 * consent" -- Twilio lists it among the causes of error 30913 -- and CTIA's
 * principles require written consent for marketing. So a yes to offers is a
 * sign-up form the customer signed, or their own message; a spoken yes, in person
 * or on the phone, is a yes to messages about their visit and nothing more.
 *
 * 00095 said this in its own comment ("both are express written consent") while
 * its check let a spoken yes through. 00100 closes that in the database; this is
 * the same rule for the route and the menus, so all three say one thing.
 *
 * Only the YES is narrowed. A "no more offers" is honoured however it is said.
 */
export const OFFERS_YES_SOURCES: readonly string[] = ["form", "customer_message"];

/** Why a yes to offers given this way cannot be recorded -- or null when it can. */
export function offersYesRefusal(source: string | null | undefined): string | null {
  if (source && OFFERS_YES_SOURCES.includes(source)) return null;
  return "A yes to offers has to be in writing: a sign-up form they signed, or their own message. A spoken yes covers messages about their visit, not offers.";
}

/**
 * "Their own message" names the message (00137).
 *
 * A desk could record an answer "in their own message" with nothing behind it:
 * both doors took the source from any signed-in member, and the ledger then
 * said a customer had written something nobody had looked for. When the
 * conversation is in Chanlytics the desk now names the message they sent, and
 * the door copies its id and words into the evidence. An answer given
 * somewhere Chanlytics does not see is a sign-up form, with a note saying where.
 *
 * The database says these sentences too, so a refusal reads the same whichever
 * of the two gives it; their-own-message.db.test.mjs holds the two equal.
 */
export const OWN_MESSAGE_REFUSALS = {
  /** Their own message, with no message named. */
  missing: "Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn't see, record a sign-up form and say where in the note.",
  /** The message named is not one this person sent this workspace. */
  notTheirs: "That isn't a message this person sent you. Choose one of theirs.",
  /** The message named has nothing written in it. */
  wordless: "That message has no words in it to show their answer. Choose the one where they said it.",
  /** A message named beside another way of answering. */
  notOwnMessage: "Only an answer in their own message names a message.",
  /** Their own message, for many people at once: one message cannot be every person's. */
  batch: "Their own message is recorded one person at a time, on their page, where you choose the message. For signed slips, choose Sign-up form.",
} as const;

/** Why an answer given this way cannot be recorded with this message -- or null when it can. */
export function ownMessageRefusal(source: string | null | undefined, messageId: string | null | undefined): string | null {
  if (source === "customer_message") return messageId ? null : OWN_MESSAGE_REFUSALS.missing;
  return messageId ? OWN_MESSAGE_REFUSALS.notOwnMessage : null;
}

/** The words for a source; the reset has none, an unknown one is shown as itself. */
export function consentSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  const known = CONSENT_SOURCES.find((s) => s.id === source);
  if (known) return known.label;
  return source === CONSENT_RESET_SOURCE ? null : source;
}

function consentOf(r: PersonRowDto, tz: string, nowMs: number): PersonConsent {
  const dnc = !!r.dnc;
  const state: PersonConsent["state"] =
    r.consent === "opted_out" || dnc ? "opted_out" : r.consent === "opted_in" ? "opted_in" : "unknown";
  const when = ts(r.consent_updated_at);
  const date = when !== null ? fmtDate(when, tz, nowMs) : "recorded";
  const how = consentSourceLabel(r.consent_source);
  const sub =
    state === "opted_out"
      ? (r.consent_source === "customer_message"
          ? `STOP received${when !== null ? ` ${fmtDate(when, tz, nowMs)}` : ""}`
          : `${how ? `${how} · ` : ""}${date}`)
    : state === "opted_in" ? `${how ? `${how} · ` : ""}${date}`
    : "no opt-in recorded";
  // The offers answer, judged on its own. A STOP or a do-not-call stops
  // everything, so it shows here as opted_out too -- but declining offers never
  // reads back as an opt-out of conversation.
  const marketing: PersonConsent["marketing"] =
    dnc || r.consent === "opted_out" ? "opted_out"
    : r.marketing_consent === "opted_in" ? "opted_in"
    : r.marketing_consent === "opted_out" ? "opted_out"
    : "unknown";
  const mWhen = ts(r.marketing_consent_updated_at ?? null);
  const mHow = consentSourceLabel(r.marketing_consent_source ?? null);
  const marketingSub =
    marketing === "opted_in" ? `${mHow ? `${mHow} · ` : ""}${mWhen !== null ? fmtDate(mWhen, tz, nowMs) : "recorded"}`
    : marketing === "opted_out" ? "no offers"
    : "never asked about offers";
  return {
    state, dnc,
    label: state === "opted_out" ? "Opted out" : state === "opted_in" ? "Opted in" : "Unknown",
    sub,
    source: r.consent_source ?? null,
    marketing,
    marketingSource: r.marketing_consent_source ?? null,
    marketingSub,
    // The offers answer in the words People's Offers column uses, so a list and the page agree.
    marketingLabel: marketing === "opted_in" ? "Yes" : marketing === "opted_out" ? "No" : "Not asked",
  };
}

/**
 * May a message of this purpose reach this person? A number to send to, and the
 * yes THIS message needs.
 *
 * IT LIVES HERE, beside `consentOf`, because it is a question about a person, and
 * because this module's own lists were answering it by hand. `offers_ok` and
 * `peopleListAction` each spelled "said yes to offers" as a bare
 * `consent.marketing === "opted_in"` -- no phone check -- while the broadcast route
 * enrolled with this. So a list could promise "4 said yes to offers -- a broadcast
 * reaches them" about people with no number the route would then leave out. It was
 * one rule in the commit message and three in the code.
 *
 * ONE RULE, NOT TWO. This used to restate `mayMessageFor`'s logic by hand,
 * because the two sides of one pipeline hold the person in two different shapes:
 * the route and the page hold a `PersonRowVM`, the send job holds the database
 * row. Two hand-written copies of a consent rule is the thing this file's own
 * header calls a defect, and it duly drifted -- the enrolment half asked for
 * marketing consent while the sending half asked what the template implied. So
 * the shape is adapted here and the QUESTION is answered in exactly one place.
 *
 * `proactive` is always true: a broadcast starts a conversation. Nobody wrote to
 * us to ask for it.
 *
 * THE PURPOSE IS REQUIRED, and that is the fix rather than a detail of it. It
 * used to default to marketing, described as "the safe answer for a caller that
 * has not thought about it" -- and every caller but one then failed to think
 * about it, so a utility message was refused to the very people migration 00095
 * exists to reach. A default cannot be audited; a required argument is checked
 * by the compiler at every call site, the way `businessRecordProblems` requires
 * its registration path.
 */
export function mayReceive(
  r: Pick<PersonRowVM, "consent" | "phone">,
  purpose: SendPurpose,
): boolean {
  // Every audience today leaves by WhatsApp or text, and both need a number. A
  // person with an address and none is reached when the email wire carries
  // reminders (docs/plans/2026-09-17-email-channel.md, §11), not before.
  if (!r.phone) return false;
  return mayMessageFor(
    { consent: r.consent.state, dnc: r.consent.dnc, marketing_consent: r.consent.marketing },
    purpose,
    { proactive: true },
  ).ok;
}

export type ReceptionistTone = "answering" | "escalated" | "queued" | "snoozed" | "paused" | "silent";

export interface PersonReceptionist {
  tone: ReceptionistTone;
  label: string;
}

function receptionistOf(r: PersonRowDto, tz: string, nowMs: number): PersonReceptionist {
  // A thread a person owns is theirs, whatever flagged it — the Inbox says
  // "you have it" for the same row, and the two must not disagree.
  if (isOwned(r, nowMs)) return { tone: "paused", label: "Paused, a person owns the thread" };
  if (r.open_escalation_reason) return { tone: "escalated", label: `Escalated, ${reasonShort(r.open_escalation_reason)}` };
  if (r.needs_human) return { tone: "escalated", label: "Waiting for a person" };
  if (r.queued_reply_at) return { tone: "queued", label: "Reply queued" };
  const snooze = ts(r.latest_snooze_until);
  if (r.latest_state === "snoozed" && snooze !== null && snooze > nowMs) {
    return { tone: "snoozed", label: `Snoozed until ${shortTime(r.latest_snooze_until, tz, new Date(nowMs))}` };
  }
  if (r.consent === "opted_out" || r.dnc) return { tone: "silent", label: "Silent, they opted out" };
  // "Answering" was shown for a person the owner had set to Never.
  if (r.effective_reply_mode === "never") return { tone: "paused", label: `Held for you, set to ${PERSON_MODE_WORDS.never}` };
  if (r.effective_reply_mode === "ask") return { tone: "paused", label: `Held for you, set to ${PERSON_MODE_WORDS.ask}` };
  return { tone: "answering", label: "Answering" };
}

/* ------------------------------- row VM ---------------------------------- */

export interface PersonRowVM {
  id: string;
  real: true;
  name: string;
  /** The name a human typed, or null — what a rename field starts from. */
  givenName: string | null;
  initials: string;
  phone: string | null;
  email: string | null;
  waName: string | null;
  channels: PersonChannel[];
  hasChat: boolean;
  state: PersonState;
  stateLabel: string;
  /** The reason behind the state, in a few words. Empty for "active". */
  stateDetail: string;
  lastContact: PersonLastContact;
  receptionist: PersonReceptionist;
  firstContact: PersonFirstContact;
  /** Where they first came from, in words (cameFromOf); null when nothing says. */
  cameFrom: { key: PersonCameFrom; label: string } | null;
  consent: PersonConsent;
  /** The customer's last words, verbatim. */
  quote: string | null;
  /** The last call they placed, summarised by the receptionist; null without one. */
  callSummary: string | null;
  threads: number;
  calls: number;
  escalations: number;
  callSeconds: number;
  /** The Inbox route id (`th-<conversation>`); null without a chat. */
  threadId: string | null;
  needsYouSinceMs: number | null;
  /** The calendar's state for this workspace: the outcome lists exist only when it is "ok". */
  calendar: "ok" | "unavailable" | "none";
  /** An appointment ahead on the calendar. */
  booked: boolean;
  /** "Tue, Sep 8" — the day of the next appointment, for the chip. */
  nextVisitDay: string | null;
  /** "Tue, Sep 8 · 2:00 – 5:00 PM · Balayage" */
  nextVisit: string | null;
  lastVisit: string | null;
  /** "Thu, Aug 20" — the day of the last visit, for the row when nothing is ahead. */
  lastVisitDay: string | null;
  /** WhatsApp's 24-hour window for a free reply: open, and how long is left. Null without a chat. */
  replyWindow: { open: boolean; hoursLeft: number } | null;
  /** The wire a reply goes out on, in words ("Email", "WhatsApp", "Text"); null for a person who has only phoned. */
  replyVia: "WhatsApp" | "Text" | "Email" | null;
  /** Their channels in words, in the order the page shows them: "WhatsApp · Phone", "Email". */
  channelWords: string;
  /** The booking-link button's words for the wire a reply goes out on (bookingLinkAction). */
  bookingLinkAction: { label: string; title: string; ready: boolean };
  /** When they last wrote or called, whichever is later. */
  askedMs: number | null;
  /** Wrote or called in the last 30 days, and the calendar has never had them. */
  askedNotBooked: boolean;
  nextVisitMs: number | null;
  lastVisitMs: number | null;
  /** Days until the next appointment (0 = today); null without one. */
  nextVisitDays: number | null;
  /** Days since the last visit; null without one. */
  lastVisitDays: number | null;
  /** "2026-09-08": the day of the next / last visit by the calendar's own clock — what a day-keyed playbook reads. */
  nextVisitDate: string | null;
  lastVisitDate: string | null;
  /** The calendar's zone; null without a calendar. */
  calendarTz: string | null;
}

export function toPersonRowVM(r: PersonRowDto, tz: string, now = new Date()): PersonRowVM {
  const nowMs = now.getTime();
  const name = personName(r);
  const state = personStateFor(r, nowMs);
  const last = lastContactOf(r, tz, nowMs);
  const first = firstContactOf(r, tz, nowMs);
  const consent = consentOf(r, tz, nowMs);
  // Booked is a fact from the calendar, not a stage: an appointment ahead.
  // Asked-not-booked is the gap the owner can act on — they reached out
  // this month and the calendar has never had them.
  const v = r.visits ?? null;
  const calendar = v ? v.state : "none";
  // Their message, or the call they placed. A call the owner made is not them asking.
  const askedCandidates = [ts(r.last_inbound_at), ts(r.last_inbound_call_at ?? null)].filter((x): x is number => x !== null);
  const askedMs = askedCandidates.length ? Math.max(...askedCandidates) : null;
  const booked = !!v?.next;
  const nextVisitMs = v?.next ? Date.parse(v.next.start) : null;
  const lastVisitMs = v?.last ? Date.parse(v.last.start) : null;
  const askedNotBooked = calendar === "ok" && askedMs !== null && nowMs - askedMs <= MONTH_MS && !v?.next && !v?.last;
  const stateDetail =
    state === "needs_you" ? (r.open_escalation_reason ? reasonShort(r.open_escalation_reason) : "waiting for a person")
    : state === "waiting_on_you" ? "you own the thread and they wrote last"
    : state === "opted_out" ? consent.sub
    : state === "new" ? `first contact ${first.label}`
    : state === "quiet" ? (last.ts === null ? "no contact recorded" : `last contact ${ago(last.ts, tz, nowMs)}`)
    : "";
  return {
    id: r.id,
    real: true,
    name,
    givenName: r.display_name?.trim() || null,
    initials: initialsOf(name),
    phone: formatPhoneDisplay(r.phone_e164),
    email: r.email ?? null,
    waName: r.wa_profile_name,
    channels: channelsOf(r),
    hasChat: !!r.has_chat,
    state,
    stateLabel: PERSON_STATE_LABELS[state],
    stateDetail,
    lastContact: last,
    receptionist: receptionistOf(r, tz, nowMs),
    firstContact: first,
    cameFrom: cameFromOf(r),
    consent,
    quote: r.last_inbound_text?.trim() || null,
    callSummary: r.last_inbound_call_summary?.trim() || null,
    threads: r.conversation_count ?? 0,
    calls: r.call_count ?? 0,
    escalations: r.escalation_count ?? 0,
    callSeconds: r.call_seconds ?? 0,
    threadId: r.has_chat && r.latest_conversation_id ? `th-${r.latest_conversation_id}` : null,
    needsYouSinceMs: ts(r.open_escalation_since),
    calendar,
    booked,
    nextVisitDay: v?.next ? visitDay(v.next.start, v.timezone, nowMs) : null,
    nextVisit: v?.next ? `${visitLine(v.next, v.timezone, nowMs)} · ${v.next.title}` : null,
    lastVisit: v?.last ? `${visitLine(v.last, v.timezone, nowMs)} · ${v.last.title}` : null,
    lastVisitDay: v?.last ? visitDay(v.last.start, v.timezone, nowMs) : null,
    // Channel-aware: only WhatsApp has a window (policy replyWindow). This read
    // WhatsApp's for everybody, so a person who had only ever emailed was shown
    // "Closed · template only" -- a template they cannot receive, on a wire
    // they have never used.
    ...(() => {
      const via = replyChannelOfRow(r);
      if (!via) return { replyWindow: null, replyVia: null, bookingLinkAction: bookingLinkAction(null, null) };
      const w = replyWindow(via, r.latest_wa_inbound_at, now);
      const win = { open: w.open, hoursLeft: w.closesAtIso ? Math.max(0, Math.round((new Date(w.closesAtIso).getTime() - nowMs) / 3_600_000)) : 0 };
      return { replyWindow: win, replyVia: REPLY_VIA[via], bookingLinkAction: bookingLinkAction(REPLY_VIA[via], win) };
    })(),
    channelWords: channelsOf(r).map((c) => PERSON_CHANNEL_WORDS[c]).join(" · "),
    askedMs,
    askedNotBooked,
    nextVisitMs,
    lastVisitMs,
    nextVisitDays: nextVisitMs !== null ? Math.max(0, Math.ceil((nextVisitMs - nowMs) / DAY_MS)) : null,
    lastVisitDays: lastVisitMs !== null ? Math.max(0, Math.floor((nowMs - lastVisitMs) / DAY_MS)) : null,
    nextVisitDate: v?.next ? visitDateKey(v.next.start, v.timezone) : null,
    lastVisitDate: v?.last ? visitDateKey(v.last.start, v.timezone) : null,
    calendarTz: v?.timezone ?? null,
  };
}

/* ---------------------------- lists and totals --------------------------- */

export type PeopleListGroup = "attention" | "journey" | "reach";

/** The rail's three quiet labels: what needs a person, where each person is on the way to a booking, who can be reached. */
export const PEOPLE_LIST_GROUPS: readonly { id: PeopleListGroup; label: string }[] = [
  { id: "attention", label: "Attention" },
  { id: "journey", label: "Journey" },
  { id: "reach", label: "Reach" },
];

/**
 * The rail's smart lists: computed filters over facts, not saved segments,
 * in three groups. The journey lists that read the calendar exist only when
 * one is connected; the booking is the conversion, and a visit is the fact
 * a salon cares about — a regular who never texts is not quiet.
 */
export const PEOPLE_LISTS: readonly { id: string; label: string; group: PeopleListGroup; needsCalendar?: boolean; test: (vm: PersonRowVM) => boolean }[] = [
  { id: "needs_you", label: "Needs you", group: "attention", test: (v) => v.state === "needs_you" },
  { id: "waiting_on_you", label: "Waiting on you", group: "attention", test: (v) => v.state === "waiting_on_you" },
  { id: "new_week", label: "New this week", group: "journey", test: (v) => v.state === "new" },
  { id: "booked_week", label: "Booked this week", group: "journey", needsCalendar: true, test: (v) => v.nextVisitDays !== null && v.nextVisitDays <= 7 },
  { id: "booked", label: "Booked", group: "journey", needsCalendar: true, test: (v) => v.booked },
  { id: "asked_never_booked", label: "Asked, never booked", group: "journey", needsCalendar: true, test: (v) => v.askedNotBooked },
  // Forty-five days since the chair, nothing ahead: the win-back list, from visits rather than silence.
  { id: "lapsed", label: "Lapsed", group: "journey", needsCalendar: true, test: (v) => !v.booked && v.lastVisitDays !== null && v.lastVisitDays >= 45 },
  { id: "quiet", label: "Quiet 30+ days", group: "reach", test: (v) => v.state === "quiet" },
  { id: "phoned_only", label: "Phoned only", group: "reach", test: (v) => !v.hasChat && v.calls > 0 },
  // A fact, not the state: someone who opted out AND needs you is in both lists.
  //
  // TWO LISTS, BECAUSE THERE ARE TWO ANSWERS. This one was labelled "Can receive
  // offers" and tested the CONVERSATIONAL column, which after 00095 is the one
  // answer that says nothing about offers -- so the list a person opened to find
  // their promotional audience showed everybody who had ever texted START. The id
  // is unchanged on purpose: a saved broadcast's audience refers to it by id, and
  // renaming it would repoint filings that have already gone out.
  { id: "opted_in", label: "Said yes to messages", group: "reach", test: (v) => v.consent.state === "opted_in" },
  // The promotional audience, on its own column. The only people a MARKETING
  // broadcast may reach.
  // CAN receive, so it is the broadcast's own rule -- a yes to offers AND a number --
  // not the bare answer, which was the difference between this list and what the
  // route would actually enrol.
  { id: "offers_ok", label: "Can receive offers", group: "reach", test: (v) => mayReceive(v, "marketing") },
  { id: "opted_out", label: "Opted out", group: "reach", test: (v) => v.consent.state === "opted_out" },
];

export interface PeopleListAction {
  /** The sentence under the list: what the step reaches, or why it cannot yet. */
  text: string;
  /** The button's words. */
  cta: string;
  /** A route. */
  to: string;
  enabled: boolean;
}

/**
 * Where a person's yes to offers is got: Broadcasts' "Get their yes" section,
 * brought into view -- the QR for the desk, the phrase, the link for a bio, the
 * paper form.
 *
 * Five places said the fix was there -- "The phrase and the QR are on
 * Broadcasts" -- and none of them went there: two steps opened the TOP of
 * Broadcasts, where the composer is and the QR is below the fold, and three
 * printed the sentence beside a disabled button. One route, one spelling.
 */
export const GET_YES_ROUTE = "broadcasts/get-yes";

const LIST_STEPS: Record<string, { cta: string; to: string; broadcast?: boolean; text?: string }> = {
  needs_you: { cta: "Open the Inbox", to: "inbox", text: "Each of them is waiting for a person." },
  waiting_on_you: { cta: "Open the Inbox", to: "inbox", text: "You own these threads, and they wrote last." },
  new_week: { cta: "Get their yes", to: GET_YES_ROUTE, text: "Their yes to offers is the phrase and the QR on Broadcasts." },
  booked_week: { cta: "See the week", to: "calendar", text: "Their appointments are on the Calendar." },
  asked_never_booked: { cta: "Text the booking link", to: "broadcasts/asked_never_booked", broadcast: true },
  lapsed: { cta: "Win them back", to: "broadcasts/lapsed", broadcast: true },
  quiet: { cta: "Reach out", to: "broadcasts/quiet", broadcast: true },
  // The broadcast step belongs to the OFFERS list, not to this one: a person on
  // this list has said yes to hearing from the business, which is not a yes to a
  // promotion. Sending them here with "New broadcast" is what made the empty
  // audience feel like a bug in the composer rather than a missing answer.
  opted_in: { cta: "Get their yes to offers", to: GET_YES_ROUTE, text: "They answer and hear about their own visits. Offers need a second, separate yes." },
  // Broadcasts has no audience for this list: its people are exactly who a broadcast reaches, so the composer
  // opens on Everyone, and the button says so in the composer's words (broadcasts.ts EVERYONE_LABEL). It said
  // "New broadcast" here and "Use in a broadcast" on Lists, and opened an audience with another name.
  offers_ok: { cta: "Broadcast to everyone who said yes", to: "broadcasts", broadcast: true },
};

/**
 * The obvious next step for a list, when it has one. A broadcast reaches
 * only a recorded yes, so the sentence says how many of the list said it,
 * and the button waits until someone has.
 *
 * WHICH yes it counts is the MARKETING one, because these steps all open the
 * composer on a promotional send (win them back, reach the quiet ones, run an
 * offer). Counting the conversational answer here promised an audience the
 * composer would then refuse -- the same mismatch, one screen earlier.
 */
export function peopleListAction(id: string, members: PersonRowVM[]): PeopleListAction | null {
  const step = LIST_STEPS[id];
  if (!step) return null;
  if (!step.broadcast) return { text: step.text ?? "", cta: step.cta, to: step.to, enabled: members.length > 0 };
  return broadcastStep(step.cta, step.to, members);
}

/**
 * A list kept by hand has one onward step: a broadcast to the people on it who said yes to offers. The same
 * sentence and the same rule as a smart list's broadcast step, so the two kinds of list read alike on People,
 * which is where both live now (the Lists page folded into it).
 */
export function savedListAction(id: string, members: PersonRowVM[]): PeopleListAction {
  return broadcastStep("Use in a broadcast", `broadcasts/${id}`, members);
}

function broadcastStep(cta: string, to: string, members: PersonRowVM[]): PeopleListAction {
  const offersYes = members.filter((m) => mayReceive(m, "marketing")).length;
  if (offersYes === 0) {
    // People on the list, and not one of them has said yes to offers: the
    // list's own step cannot run, and the thing that CAN is getting that yes.
    // It printed "The phrase and the QR are on Broadcasts" beside a disabled
    // "Win them back" -- the answer in words, next to a button that went
    // nowhere. The button is the door to the answer now. Navigation only: who
    // may be sent an offer is exactly what it was.
    //
    // NOT when someone here already said yes and simply has no number to send
    // to: sending them to "get their yes" would ask for an answer they gave. That
    // case keeps the list's own step, waiting, as before.
    const saidYes = members.some((m) => m.consent.marketing === "opted_in");
    if (members.length && !saidYes) {
      return {
        text: "Nobody on this list has said yes to offers yet — a broadcast reaches only that answer.",
        cta: "Get their yes", to: GET_YES_ROUTE, enabled: true,
      };
    }
    return {
      text: members.length
        ? "Nobody on this list can be sent an offer yet — a broadcast reaches only a recorded yes with a number to send to."
        : "Nobody here right now.",
      cta, to, enabled: false,
    };
  }
  return { text: `${offersYes} of ${members.length} on this list said yes to offers — a broadcast reaches them.`, cta, to, enabled: true };
}

export interface PeopleAggregates {
  total: number;
  needsYou: number;
  needsYouOldestMs: number | null;
  /** First contact within 30 days, by evidence. */
  newThisMonth: number;
  /** Any message or call within 7 days. */
  reachedWeek: number;
  reachedWeekNew: number;
  /** An appointment ahead on the calendar. */
  booked: number;
  /** Wrote or called this month; the calendar has never had them. */
  askedNotBooked: number;
}

export function peopleAggregates(rows: PersonRowVM[], nowMs: number): PeopleAggregates {
  let needsYou = 0;
  let oldest: number | null = null;
  let newThisMonth = 0;
  let reachedWeek = 0;
  let reachedWeekNew = 0;
  let booked = 0;
  let askedNotBooked = 0;
  for (const v of rows) {
    if (v.booked) booked++;
    if (v.askedNotBooked) askedNotBooked++;
    if (v.state === "needs_you") {
      needsYou++;
      if (v.needsYouSinceMs !== null && (oldest === null || v.needsYouSinceMs < oldest)) oldest = v.needsYouSinceMs;
    }
    if (v.firstContact.evidence && v.firstContact.ts !== null && nowMs - v.firstContact.ts <= MONTH_MS) newThisMonth++;
    if (v.lastContact.ts !== null && nowMs - v.lastContact.ts <= WEEK_MS) {
      reachedWeek++;
      if (v.state === "new") reachedWeekNew++;
    }
  }
  return { total: rows.length, needsYou, needsYouOldestMs: oldest, newThisMonth, reachedWeek, reachedWeekNew, booked, askedNotBooked };
}

const RECENCY_BUCKETS = [
  { label: "today", max: 1 },
  { label: "3d", max: 3 },
  { label: "1w", max: 7 },
  { label: "2w", max: 14 },
  { label: "1m", max: 30 },
  { label: "2m", max: 60 },
  { label: "3m", max: 90 },
  { label: "older", max: Infinity },
];

/** Days since last contact, bucketed — the honest replacement for the
 *  mockup's temperature strip. */
export function recencyCells(rows: PersonRowVM[], nowMs: number): { label: string; count: number }[] {
  const cells = RECENCY_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
  for (const v of rows) {
    const days = v.lastContact.ts === null ? Infinity : (nowMs - v.lastContact.ts) / DAY_MS;
    let i = RECENCY_BUCKETS.findIndex((b) => days < b.max);
    if (i === -1) i = cells.length - 1;
    cells[i].count++;
  }
  return cells;
}

/* ------------------------- the attention strip --------------------------- */

export interface AttentionRowVM {
  /** Where they last reached us: "WhatsApp" or "Phone"; null with no contact. */
  channel: "WhatsApp" | "Phone" | null;
  /** "2h ago"; "no contact yet". */
  when: string;
  /** What the row says about them: their own words, or the best evidence. */
  sentence: string;
  /** True when `sentence` is their words, verbatim. */
  quoted: boolean;
  /** "Escalated · asked for a person · since 2:14 PM", as segments. */
  status: string[];
  tone: ReceptionistTone;
  /** The one thing this state asks of you, when it differs from opening the profile. */
  cta: { label: string; kind: "primary" | "ghost"; to: string } | null;
}

/** One line, whitespace collapsed, cut with an ellipsis past `max`. */
function oneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** "2:14 PM" inside a day; "Sep 4 2:14 PM" further back — by the business's clock. */
function clock(ms: number, tz: string, nowMs: number): string {
  const time = clockTime(ms, tz);
  return nowMs - ms < DAY_MS ? time : `${fmtDate(ms, tz, nowMs)} ${time}`;
}

/**
 * One row of "where your attention matters": the mockup's grammar — a name,
 * where and when, one sentence, one state line, one button — filled only
 * with what is on record. Their words come first; then the last call's
 * summary; then the calendar; then the plain fact of a call. The button is
 * the one thing the state asks of you, and it exists only when that differs
 * from opening the profile, which the row itself does.
 */
export function attentionRow(p: PersonRowVM, tz: string, nowMs: number): AttentionRowVM {
  const lc = p.lastContact;
  const channel: AttentionRowVM["channel"] = lc.kind === "call" ? "Phone" : lc.kind === "message" ? "WhatsApp" : null;
  const when = lc.ts === null ? "no contact yet" : ago(lc.ts, tz, nowMs);
  let sentence: string;
  let quoted = false;
  if (p.quote) { sentence = oneLine(p.quote, 160); quoted = true; }
  else if (p.callSummary) sentence = oneLine(tidyCallSummary(p.callSummary) ?? p.callSummary, 160);
  else if (p.nextVisit) sentence = `Booked · ${p.nextVisit}`;
  else if (p.lastVisit) sentence = `Last visit · ${p.lastVisit}`;
  else if (p.calls > 0) sentence = p.calls === 1 ? "Phoned once; nothing in writing yet" : `Phoned ${p.calls} times; nothing in writing yet`;
  else sentence = "Nothing written yet";
  const r = p.receptionist;
  let status: string[];
  if (p.state === "waiting_on_you") status = ["You own the thread", "they wrote last"];
  else if (r.tone === "answering") status = p.hasChat ? ["Receptionist", "answering on WhatsApp"] : ["Receptionist", "takes their calls"];
  else status = r.label.split(", ");
  if (p.state === "needs_you" && p.needsYouSinceMs !== null) status = [...status, `since ${clock(p.needsYouSinceMs, tz, nowMs)}`];
  const cta: AttentionRowVM["cta"] = !p.threadId
    ? null
    : p.state === "needs_you" || p.state === "waiting_on_you"
      ? { label: "Open in Inbox", kind: "primary", to: `inbox/${p.threadId}` }
      : { label: "Open thread", kind: "ghost", to: `inbox/${p.threadId}` };
  return { channel, when, sentence, quoted, status, tone: r.tone, cta };
}

/* -------------------------------- profile -------------------------------- */

export type TimelineKind = "customer" | "receptionist" | "you" | "system" | "call" | "escalation" | "decision" | "visit" | "consent";

/**
 * How a profile's timeline narrows: everything, or one kind of record. "Messages" is the thread itself --
 * what was said, and the escalations and decisions in it; only "All" keeps the system lines.
 */
export type TimelineFilterId = "all" | "messages" | "calls" | "visits" | "consent";
export const TIMELINE_FILTERS: readonly { id: TimelineFilterId; label: string; kinds: readonly TimelineKind[] | null }[] = [
  { id: "all", label: "All", kinds: null },
  { id: "messages", label: "Messages", kinds: ["customer", "receptionist", "you", "escalation", "decision"] },
  { id: "calls", label: "Calls", kinds: ["call"] },
  { id: "visits", label: "Visits", kinds: ["visit"] },
  { id: "consent", label: "Consent", kinds: ["consent"] },
];

/** The items a filter shows, in the order they came; an unknown filter shows everything. */
export function filterTimeline<T extends { kind: TimelineKind }>(items: readonly T[], id: string): T[] {
  const kinds = TIMELINE_FILTERS.find((f) => f.id === id)?.kinds ?? null;
  return kinds ? items.filter((i) => kinds.includes(i.kind)) : [...items];
}

/**
 * A consent change, in the words the timeline uses: what was answered, and
 * how we know. An answer the customer texted quotes them; one taken at the
 * desk names the way and the recorder's note. The words here are the only
 * ones the page has, so an owner reads "how do we know" without a database.
 */
export function consentChangeWords(c: ConsentChange): { who: string; text: string; sub?: string } {
  const offers = c.purpose === "marketing";
  const text =
    c.consent === "opted_in" ? (offers ? "Said yes to offers and news" : "Said yes to messages about their visit")
    : c.consent === "opted_out" ? (offers ? "Said no to offers" : "Said stop — nothing goes out to them")
    : offers ? "Offers: back to not asked" : "Back to not asked";
  let sub: string | undefined;
  if (c.source === "customer_message") {
    const where = c.channel === "sms" ? "by text" : c.channel === "whatsapp" ? "on WhatsApp" : c.channel === "email" ? "by email" : "in their own message";
    sub = `In their own words ${where}${c.words ? `: “${c.words}”` : ""}`;
  } else if (c.source === CONSENT_RESET_SOURCE || !c.source) {
    sub = "Reset by staff";
  } else {
    sub = `${consentSourceLabel(c.source) ?? c.source}, recorded by staff${c.note ? ` · ${c.note}` : ""}`;
  }
  return { who: offers ? "Offers" : "Consent", text, sub };
}

export interface PersonTimelineItemVM {
  id: string;
  ts: number;
  time: string;
  day: string;
  kind: TimelineKind;
  who: string;
  text: string;
  sub?: string;
  link?: { label: string; to: string };
}

export interface PersonRightNow {
  tone: ReceptionistTone;
  title: string;
  detail: string;
  cta: { label: string; to: string } | null;
}

export interface PersonFact {
  label: string;
  value: string | number;
  meta: string;
  tone?: "neg" | "pos" | "";
}

export interface PersonVM extends PersonRowVM {
  /** "Since Jul 14" / "Since before Aug 27" / "" */
  since: string;
  /** "3 conversations · 2 calls" */
  metaLine: string;
  lastExchange: {
    customer: { text: string; at: string } | null;
    reply: { text: string; at: string; who: "Receptionist" | "You" } | null;
  };
  facts: PersonFact[];
  rightNow: PersonRightNow;
  timeline: PersonTimelineItemVM[];
  about: { k: string; v: string }[];
  /** The owner's notes, the receptionist's reading material. */
  notes: string | null;
  /** The workspace's booking link, or null when none is on file. */
  bookingLink: string | null;
  /** "inbox/th-…" or null for a phone-only person. */
  openThread: string | null;
  /** The person's own setting (null = following the workspace) and the
   *  workspace's mode, so the rail can say which is in force. 'veto' at the
   *  workspace level still answers, after a hold, so it reads as "Answer". */
  receptionistMode: { person: PersonMode | null; workspace: PersonMode | null };
  /** What they have written to you, newest first: the messages an answer "in their own message" may name (00137). */
  ownMessages: OwnMessageVM[];
}

/** One message a person wrote to the business, as the desk chooses it for an answer given in it. */
export interface OwnMessageVM {
  /** The message's own id: what the door is handed, and what the evidence names. */
  id: string;
  /** What they wrote, on one line: the eighty characters the evidence keeps, and an ellipsis when there were more. */
  words: string;
  /** The wire it came on, in the page's word for it. */
  via: string;
  /** When they sent it, by the business's clock. */
  when: string;
}

/** How many of a person's messages their page offers to choose from: the recent ones. */
const OWN_MESSAGE_CHOICES = 10;
/** How much of their words the evidence keeps (00110, 00137). */
const EVIDENCE_WORDS = 80;

/**
 * What a person wrote to you, newest first, judged the way the door judges it
 * (00137): an inbound message from the customer on a written wire, with words
 * in it -- its text, or a photo's caption. So nothing offered here is one the
 * door refuses. The words are said on one line and cut where the evidence
 * cuts them, so the owner chooses what will be kept.
 */
function ownMessagesOf(d: PersonDetailDto, stamp: (t: number) => { time: string; day: string }): OwnMessageVM[] {
  const found: { t: number; vm: OwnMessageVM }[] = [];
  for (const c of d.conversations) {
    for (const m of c.messages) {
      if (m.direction !== "inbound" || m.sender !== "customer" || m.channel === "voice" || m.channel === "system") continue;
      const said = [m.body, m.media?.caption].map((s) => (s ?? "").replace(/\s+/g, " ").trim()).find(Boolean);
      const t = ts(messageAt(m));
      if (!said || t === null) continue;
      const chars = Array.from(said);
      const at = stamp(t);
      found.push({
        t,
        vm: {
          id: m.id,
          words: chars.length > EVIDENCE_WORDS ? `${chars.slice(0, EVIDENCE_WORDS).join("")}…` : said,
          via: PERSON_CHANNEL_WORDS[m.channel as PersonChannel] ?? "",
          when: `${at.day}, ${at.time}`,
        },
      });
    }
  }
  return found.sort((a, b) => b.t - a.t).slice(0, OWN_MESSAGE_CHOICES).map((f) => f.vm);
}

const DECISION_LABELS: Record<string, { who: string; text: string }> = {
  take_over: { who: "Took over", text: "You paused the receptionist on this thread" },
  hand_back: { who: "Handed back", text: "You returned the thread to the receptionist" },
  snooze: { who: "Snoozed", text: "You snoozed the thread" },
  wake: { who: "Woke", text: "You brought the thread back" },
  resolve: { who: "Resolved", text: "You marked the escalation resolved" },
  archive: { who: "Archived", text: "You archived the thread" },
  cancel_send: { who: "Canceled a reply", text: "You stopped a reply before it sent" },
  pause_agent: { who: "Paused the receptionist", text: "You paused automatic replies" },
  resume_agent: { who: "Resumed the receptionist", text: "You resumed automatic replies" },
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function toPersonVM(d: PersonDetailDto, tz: string, now = new Date()): PersonVM {
  const nowMs = now.getTime();
  // The profile fetched this person's rows in full, so the arrays are the
  // ground truth here and the list row is the summary. Where they disagree
  // (a fresh escalation between the two reads) the arrays win, and every
  // count on the page agrees with the timeline beneath it.
  const openEsc = d.escalations
    .filter((e) => e.state === "open")
    .sort((a, b) => (ts(b.created_at) ?? 0) - (ts(a.created_at) ?? 0))[0];
  const row: PersonRowDto = {
    ...d.row,
    open_escalation_reason: openEsc?.reason ?? d.row.open_escalation_reason,
    open_escalation_since: openEsc?.created_at ?? d.row.open_escalation_since,
    conversation_count: d.conversations.length || d.row.conversation_count,
    // A dial that never connected is not a call; people_list agrees, and the
    // profile used to count one more than the list.
    call_count: d.calls.length ? d.calls.filter((k) => k.status !== "not_connected").length : d.row.call_count,
    call_seconds: d.calls.length ? Math.round(d.calls.filter((k) => k.status !== "not_connected").reduce((a, k) => a + (k.duration_ms ?? 0), 0) / 1000) : d.row.call_seconds,
    escalation_count: d.escalations.length || d.row.escalation_count,
    visits: d.visits ?? d.row.visits ?? null,
  };
  const base = toPersonRowVM(row, tz, now);
  // A person we know only by number or address has no first name to shorten
  // to: "+1" as a speaker label is nobody. Keep the whole identifier.
  const first = isIdentifierName(base.name) ? base.name : base.name.split(" ")[0] || base.name;
  const stamp = (t: number) => ({ time: clockTime(t, tz), day: clockDayLabel(t, tz, nowMs) });
  const items: PersonTimelineItemVM[] = [];
  const convIds = new Set(d.conversations.map((c) => c.id));

  for (const c of d.conversations) {
    for (const m of c.messages) {
      if (m.type === "call_summary") continue; // the call carries its own item
      if (m.status === "canceled") continue; // never reached them
      const t = ts(messageAt(m));
      if (t === null) continue;
      const kind: TimelineKind =
        m.sender === "customer" ? "customer" : m.sender === "human" ? "you" : m.sender === "ai" ? "receptionist" : "system";
      const who = kind === "customer" ? first : kind === "you" ? "You" : kind === "receptionist" ? "Receptionist" : "System";
      const sub = m.status === "failed" ? "Not delivered" : m.status === "queued" ? "Sending" : undefined;
      items.push({ id: `m-${m.id}`, ts: t, ...stamp(t), kind, who, text: messageWords(m), ...(sub ? { sub } : {}), link: { label: "Open the thread", to: `inbox/th-${c.id}` } });
    }
  }

  for (const k of d.calls) {
    const t = ts(k.started_at);
    if (t === null) continue;
    const dur = mmss(k.duration_ms);
    const wanted = (k.wanted || "").trim();
    const summary = tidyCallSummary(k.summary) ?? "";
    const missed = k.status === "not_connected";
    const sentence = missed ? "The call never connected." : wanted || (summary ? (summary.split(/(?<=[.!?])\s/)[0] ?? summary) : k.in_voicemail ? "Reached voicemail." : "No summary from this call.");
    items.push({
      id: `k-${k.id}`,
      ts: t,
      ...stamp(t),
      kind: "call",
      who: missed ? "Missed call" : `${k.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` · ${dur}` : ""}`,
      text: sentence,
      sub: missed ? "Never connected" : k.recording?.fetch_state === "stored" ? "Recording and transcript in Conversations" : "Transcript in Conversations",
      link: { label: "Open", to: `conversations/cv-${k.id}` },
    });
  }

  for (const e of d.escalations) {
    const t = ts(e.created_at);
    if (t === null) continue;
    items.push({
      id: `e-${e.id}`,
      ts: t,
      ...stamp(t),
      kind: "escalation",
      who: "Escalated",
      text: capitalize(reasonShort(e.reason)) || "The receptionist stopped",
      // "Open" beside a row that opens something read as the verb; the state is what it says.
      sub: e.state === "resolved" ? "Resolved" : "Still open",
      link: { label: "Open the thread", to: `inbox/th-${e.conversation_id}` },
    });
  }

  for (const dec of d.decisions) {
    const label = DECISION_LABELS[dec.verb];
    if (!label) continue;
    const mine = (dec.subject_type === "conversation" && convIds.has(dec.subject_id)) || (dec.subject_type === "contact" && dec.subject_id === row.id);
    if (!mine) continue;
    const t = ts(dec.created_at);
    if (t === null) continue;
    items.push({ id: `d-${dec.id}`, ts: t, ...stamp(t), kind: "decision", who: label.who, text: label.text });
  }

  // Every change to either answer, from the ledger: the evidence, on the
  // same line as what was said. The decisions ledger has no label for these
  // (DECISION_LABELS), so nothing is said twice.
  for (const c of d.consent_history ?? []) {
    const t = ts(c.at);
    if (t === null) continue;
    const w = consentChangeWords(c);
    items.push({ id: `c-${c.id}`, ts: t, ...stamp(t), kind: "consent", who: w.who, text: w.text, ...(w.sub ? { sub: w.sub } : {}) });
  }

  // Their visits, from the calendar: what happened in the chair belongs on
  // the same line as what was said. A visit ahead reads as booked.
  if (d.visits?.all?.length) {
    const tz = d.visits.timezone;
    for (const v of d.visits.all) {
      const t = Date.parse(v.start);
      if (!Number.isFinite(t)) continue;
      const ahead = Date.parse(v.end) >= nowMs;
      items.push({
        id: `v-${v.id}`, ts: t, ...stamp(t), kind: "visit", who: "Calendar",
        text: `${ahead ? "Booked" : "Visited"} · ${v.title}`,
        sub: `${visitTime(v, tz)} · from ${d.visits.source}${v.via === "name" ? " · matched by name" : ""}`,
        link: { label: "Open the day", to: `calendar/${visitDateKey(v.start, tz)}` },
      });
    }
  }
  if (d.added) {
    const t = ts(d.added.at);
    if (t !== null) items.push({ id: "added", ts: t, ...stamp(t), kind: "system", who: "Calendar", text: d.added.source === "calendar" ? `Added from your calendar${d.added.title ? ` (${d.added.title})` : ""}` : "Added by hand" });
  }

  items.sort((a, b) => b.ts - a.ts);

  // Last exchange: the customer's last line and the last reply, verbatim.
  const latestConv = [...d.conversations].sort((a, b) => (ts(b.last_message_at) ?? 0) - (ts(a.last_message_at) ?? 0))[0];
  let customer: PersonVM["lastExchange"]["customer"] = null;
  let reply: PersonVM["lastExchange"]["reply"] = null;
  if (latestConv) {
    for (let i = latestConv.messages.length - 1; i >= 0; i--) {
      const m: MessageDto = latestConv.messages[i];
      if (m.type === "call_summary") continue;
      const t = ts(messageAt(m));
      if (t === null) continue;
      if (!customer && m.direction === "inbound" && m.body) customer = { text: m.body, at: `${stamp(t).time} ${stamp(t).day}` };
      if (!reply && m.direction === "outbound" && m.status !== "canceled" && (m.sender === "ai" || m.sender === "human")) {
        reply = { text: messageText(m), at: `${stamp(t).time} ${stamp(t).day}`, who: m.sender === "ai" ? "Receptionist" : "You" };
      }
      if (customer && reply) break;
    }
  }

  // Right now: what the receptionist is doing for this person. The card names the receptionist and wears the
  // standing's own word as a pill (tone.ts, the word the People row wears), so `detail` is one sentence: the
  // reason and what happens next -- never the receptionist's name again, never the state a second time. Ask
  // reads `title` and `detail` together (server/ask/tools.ts), so the title keeps the state for it.
  const threadTo = row.latest_conversation_id ? `inbox/th-${row.latest_conversation_id}` : null;
  // One door, one label: the header's "Open thread" and this card's "Open in Inbox" went to the same thread.
  const openThread = threadTo ? { label: "Open the thread", to: threadTo } : null;
  const r = row;
  let rightNow: PersonRightNow;
  // A thread a person owns is theirs, whatever flagged it: receptionistOf's
  // order, so this card and the Receptionist fact cannot disagree. It asked
  // needs_human first, and an owner who had just answered an email -- a reply
  // claims the thread, and its state stays needs_human until handed back --
  // read "Needs you · Stopped, and nobody has taken the thread yet".
  if (isOwned(r, nowMs)) {
    rightNow = { tone: "paused", title: "Paused, a person owns this thread", detail: "A person owns this thread; automatic replies resume when it is handed back.", cta: openThread };
  } else if (r.open_escalation_reason) {
    const since = r.open_escalation_since ? shortTime(r.open_escalation_since, tz, now) : null;
    rightNow = {
      tone: "escalated",
      title: `Escalated · ${reasonShort(r.open_escalation_reason)}`,
      detail: `${capitalize(reasonShort(r.open_escalation_reason))}${since ? ` · since ${since}` : ""}. Paused until someone answers.`,
      cta: openThread,
    };
  } else if (r.needs_human) {
    rightNow = { tone: "escalated", title: "Waiting for a person", detail: "Stopped, and nobody has taken the thread yet.", cta: openThread };
  } else if (r.queued_reply_at) {
    const q = ts(r.queued_reply_at);
    rightNow = { tone: "queued", title: "Reply sending", detail: `A reply is queued${q !== null ? `, ${ago(q, tz, nowMs)}` : ""} — it can still be stopped from the Inbox.`, cta: openThread };
  } else if (base.receptionist.tone === "snoozed") {
    rightNow = { tone: "snoozed", title: "Snoozed", detail: `Wakes ${shortTime(r.latest_snooze_until ?? null, tz, now)}.`, cta: openThread };
  } else if (base.consent.state === "opted_out") {
    // The consent ask on the rail carries the date and the words; here, only what it means for the thread.
    rightNow = { tone: "silent", title: "Silent, they opted out", detail: "They said stop — nothing goes out to them until they ask again.", cta: null };
  } else if (["never", "ask"].includes(d.receptionist_mode ?? "") || ["never", "ask"].includes(d.workspace_reply_mode ?? "")) {
    // "Answering" sat two inches from "Receptionist for Dani: Never".
    const theirs = ["never", "ask"].includes(d.receptionist_mode ?? "");
    const mode = theirs ? d.receptionist_mode : d.workspace_reply_mode;
    const word = PERSON_MODE_WORDS[mode === "never" ? "never" : "ask"];
    rightNow = {
      tone: "paused",
      title: `Held for you, set to ${word}`,
      detail: theirs
        ? `Set to ${word} for them — their messages come straight to you.`
        : `Set to ${word} for the workspace — every message waits for a person.`,
      cta: openThread,
    };
  } else {
    rightNow = { tone: "answering", title: "Answering", detail: "New messages are answered automatically.", cta: base.threadId ? { label: "Open the thread", to: `inbox/${base.threadId}` } : null };
  }

  // Facts strip.
  const firstIsCall = d.calls.some((k) => k.started_at && ts(k.started_at) === base.firstContact.ts);
  // The wire the first contact actually came on. It was two-valued -- a call,
  // else "WhatsApp" -- so a person whose first word was an email was introduced
  // as having arrived on WhatsApp. The profile has every message; it asks them.
  const firstWritten = d.conversations
    .flatMap((c) => c.messages)
    .filter((m) => m.type !== "call_summary")
    .map((m) => ({ at: Date.parse(m.channel_ts ?? m.created_at), channel: m.channel }))
    .filter((m) => Number.isFinite(m.at))
    .sort((a, b) => a.at - b.at)[0];
  const firstChannel = base.firstContact.estimate
    ? "imported history"
    : firstIsCall || !base.hasChat
      ? "Phone"
      : firstWritten
        ? REPLY_VIA[writtenChannelOf(firstWritten.channel)]
        : "WhatsApp";
  // Where a reply goes, exactly: the profile knows their last written words, the
  // row only which wires they have used (replyChannelOfRow says why it reads the
  // strictest window when it cannot tell).
  const via = replyChannelOfThreads(d.conversations) ?? (base.replyVia === "Email" ? "email" : base.replyVia ? "whatsapp" : null);
  const exactWindow = via ? replyWindow(via, r.latest_wa_inbound_at, now) : null;
  const lc = base.lastContact;
  const lastMeta = lc.who === "they" ? (lc.kind === "call" ? "they phoned" : "they wrote") : lc.who === "you" ? "you replied" : lc.who === "receptionist" ? "receptionist replied" : lc.who === "system" ? "we sent" : "";
  // "Held for you" is the word the People row puts beside the state, for a thread a person owns or a mode that holds.
  const toneWord: Record<ReceptionistTone, string> = { answering: "Answering", escalated: "Waiting", queued: "Queued", snoozed: "Snoozed", paused: "Held for you", silent: "Silent" };
  // Under the word, what the label says after it ("set to Never", "a person owns the thread"), not the label again.
  const receptionistMeta = (label: string) => (label.includes(", ") ? label.slice(label.indexOf(", ") + 2) : label.toLowerCase());
  const facts: PersonFact[] = [
    { label: "First contact", value: base.firstContact.label, meta: firstChannel },
    { label: "Last contact", value: lc.ts !== null ? ago(lc.ts, tz, nowMs) : "—", meta: lastMeta },
    { label: "Conversations", value: base.threads, meta: base.escalations ? `${base.escalations} needed you` : "none needed you" },
    { label: "Calls", value: base.calls, meta: base.calls ? `${Math.max(1, Math.round(base.callSeconds / 60))} min total` : "no calls" },
    // Consent is the two asks on the rail, each with how it was given. A fact, an About row and a pill said it
    // again, five times on one profile.
    { label: "Receptionist", value: toneWord[base.receptionist.tone], meta: base.receptionist.tone === "escalated" ? "for you" : receptionistMeta(base.receptionist.label) },
  ];

  // About rail.
  const about: { k: string; v: string }[] = [];
  if (base.phone) about.push({ k: "Phone", v: base.phone });
  if (base.email) about.push({ k: "Email", v: base.email });
  if (base.waName) about.push({ k: "WhatsApp name", v: base.waName });
  about.push({
    k: "First contact",
    v: base.firstContact.ts !== null
      ? `${base.firstContact.estimate ? "Before " : ""}${clockDateYear(base.firstContact.ts, tz)} · ${firstChannel}`
      : "—",
  });
  about.push({ k: "Channels", v: base.channels.map((c) => PERSON_CHANNEL_WORDS[c]).join(" · ") || "—" });
  if (base.hasChat && via && exactWindow) {
    // Only WhatsApp has a window. The row said WhatsApp's for everybody, so a
    // person who had only ever emailed read "Closed · template only".
    const hours = exactWindow.closesAtIso ? Math.max(0, Math.round((new Date(exactWindow.closesAtIso).getTime() - nowMs) / 3_600_000)) : 0;
    about.push({
      k: "Reply window",
      v: via === "email" ? "None — replies go by email" : via === "sms" ? "None — a text can be answered any time" : exactWindow.open ? `Open · ${hours}h left` : "Closed · template only",
    });
  }

  // Their appointments, when the workspace's calendar is connected: the next
  // one is the fact an owner asks for first, and the one the receptionist
  // is given when they call.
  if (d.visits) {
    const v = d.visits;
    const nextLine = v.next ? `${visitLine(v.next, v.timezone, nowMs)} · ${v.next.title}` : v.state === "ok" ? "Nothing on the calendar" : "Calendar could not be read";
    facts.push({
      label: "Next visit",
      value: v.next ? visitDay(v.next.start, v.timezone, nowMs) : "—",
      // The cell is narrow: the time here, the service in About.
      meta: v.next ? `${visitTime(v.next, v.timezone)}${v.next.via === "name" ? " · by name" : ""}` : v.state === "ok" ? "none booked" : "could not be read",
    });
    about.push({ k: "Next visit", v: nextLine });
    if (v.last) about.push({ k: "Last visit", v: `${visitLine(v.last, v.timezone, nowMs)} · ${v.last.title}` });
  }
  if (d.added) {
    const at = ts(d.added.at);
    about.push({ k: "Added", v: `${at !== null ? clockDateYear(at, tz) : "—"} · ${d.added.source === "calendar" ? `from your calendar${d.added.title ? ` (${d.added.title})` : ""}` : "by hand"}` });
  }

  return {
    ...base,
    ...(via && exactWindow
      ? (() => {
          const win = { open: exactWindow.open, hoursLeft: exactWindow.closesAtIso ? Math.max(0, Math.round((new Date(exactWindow.closesAtIso).getTime() - nowMs) / 3_600_000)) : 0 };
          return { replyVia: REPLY_VIA[via], replyWindow: win, bookingLinkAction: bookingLinkAction(REPLY_VIA[via], win) };
        })()
      : {}),
    since: base.firstContact.label === "—" ? "" : base.firstContact.estimate ? `Since ${base.firstContact.label.charAt(0).toLowerCase()}${base.firstContact.label.slice(1)}` : `Since ${base.firstContact.label}`,
    metaLine: `${plural(base.threads, "conversation")} · ${plural(base.calls, "call")}`,
    lastExchange: { customer, reply },
    facts,
    rightNow,
    timeline: items,
    about,
    notes: d.notes?.trim() || null,
    bookingLink: d.booking_link?.trim() || null,
    openThread: base.threadId ? `inbox/${base.threadId}` : null,
    receptionistMode: {
      person: asPersonMode(d.receptionist_mode),
      workspace: d.workspace_reply_mode === "veto" ? "auto" : asPersonMode(d.workspace_reply_mode),
    },
    ownMessages: ownMessagesOf(d, stamp),
  };
}
