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
import { waWindow } from "./policy";
import { visitDay, visitLine, visitTime, type PersonVisitsDto } from "./calendar-people";
import {
  initialsOf,
  messageAt,
  messageText,
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
  consent: string | null;
  consent_source: string | null;
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
  queued_reply_at: string | null;
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
}

/** What an owner may set for one person: answer, ask first, or stay out. */
export type PersonMode = "auto" | "ask" | "never";
export const PERSON_MODES: readonly PersonMode[] = ["auto", "ask", "never"];
export const PERSON_MODE_LABELS: Record<PersonMode, string> = { auto: "Answer", ask: "Ask me first", never: "Never" };

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
  send_failed: "a reply failed to send",
  deadman: "no answer in time",
  brain_error: "the receptionist hit an error",
  manual: "flagged by you",
  opt_out: "asked to stop",
  state_unavailable: "memory was unavailable",
  stale: "message arrived late",
};

export function reasonShort(reason: string | null | undefined): string {
  if (!reason) return "";
  return REASON_SHORT[reason] ?? reason.replace(/_/g, " ");
}

/* ------------------------------- helpers --------------------------------- */

const ts = (iso: string | null | undefined): number | null => (iso ? new Date(iso).getTime() : null);

const DATE_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric" });
const DATE_YEAR_FMT = new Intl.DateTimeFormat([], { month: "short", day: "numeric", year: "numeric" });
const TIME_FMT = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });

/** "Jul 14", or "Jul 14, 2025" once it is not this year. */
function fmtDate(ms: number, nowMs: number): string {
  const d = new Date(ms);
  return d.getFullYear() === new Date(nowMs).getFullYear() ? DATE_FMT.format(d) : DATE_YEAR_FMT.format(d);
}

/** "2h ago" inside a week; the date beyond it. */
export function ago(ms: number, nowMs: number): string {
  const diff = Math.max(0, nowMs - ms);
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < DAY_MS) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < WEEK_MS) return `${Math.round(diff / DAY_MS)}d ago`;
  return fmtDate(ms, nowMs);
}

function dayLabel(ms: number, nowMs: number): string {
  const d = new Date(ms);
  const now = new Date(nowMs);
  const key = d.toDateString();
  if (key === now.toDateString()) return `Today · ${DATE_FMT.format(d)}`;
  if (key === new Date(nowMs - DAY_MS).toDateString()) return `Yesterday · ${DATE_FMT.format(d)}`;
  return fmtDate(ms, nowMs);
}

function mmss(ms: number | null | undefined): string | undefined {
  if (ms == null || ms <= 0) return undefined;
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const capitalize = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function personName(r: Pick<PersonRowDto, "display_name" | "wa_profile_name" | "phone_e164">): string {
  return r.display_name || r.wa_profile_name || formatPhoneDisplay(r.phone_e164) || "Unknown";
}

export type PersonChannel = "whatsapp" | "voice";

/**
 * Channels are what actually happened, not only what identities record.
 * Production has a backfilled contact whose only identity row is 'voice'
 * and whose WhatsApp transcript is right there in messages; the glyphs must
 * not say "phone only" about them.
 */
function channelsOf(r: PersonRowDto): PersonChannel[] {
  const set = new Set<string>(r.channels ?? []);
  if (r.has_chat) set.add("whatsapp");
  if ((r.call_count ?? 0) > 0) set.add("voice");
  const order: PersonChannel[] = ["whatsapp", "voice"];
  return order.filter((c) => set.has(c));
}

export function isOwned(r: Pick<PersonRowDto, "latest_assignee_user_id" | "latest_paused_until">, nowMs: number): boolean {
  const paused = ts(r.latest_paused_until);
  return !!r.latest_assignee_user_id || (paused !== null && paused > nowMs);
}

/* ------------------------------ the rule --------------------------------- */

export function personStateFor(r: PersonRowDto, nowMs: number): PersonState {
  const flagged = !!(r.needs_human || r.open_escalation_reason);
  const owned = isOwned(r, nowMs);
  // The Inbox's rule (threadStanding): a thread someone has taken over is
  // theirs, and a snoozed one is for later — neither is "needs you". The two
  // surfaces counted different people under the same word.
  if (flagged && !owned && r.latest_state !== "snoozed") return "needs_you";
  if (owned && (flagged || r.last_message_direction === "inbound")) return "waiting_on_you";
  if (r.consent === "opted_out" || r.dnc) return "opted_out";
  const first = ts(r.first_contact_at);
  if (!r.has_backfill && first !== null && nowMs - first <= NEW_WINDOW_MS) return "new";
  const last = lastContactOf(r, nowMs).ts;
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

function lastContactOf(r: PersonRowDto, nowMs: number): PersonLastContact {
  const m = ts(r.last_message_at);
  const k = ts(r.last_call_at);
  if (m === null && k === null) return { ts: null, at: null, kind: null, who: null, label: "No contact recorded" };
  if (k !== null && (m === null || k > m)) {
    return { ts: k, at: r.last_call_at, kind: "call", who: "they", label: `Phoned · ${ago(k, nowMs)}` };
  }
  const who: PersonLastContact["who"] =
    r.last_message_direction === "inbound" ? "they"
    : r.last_message_sender === "human" ? "you"
    : r.last_message_sender === "ai" ? "receptionist"
    : "system";
  const verb =
    who === "they" ? "They wrote" : who === "you" ? "You replied" : who === "receptionist" ? "Receptionist replied" : "We sent";
  return { ts: m as number, at: r.last_message_at, kind: "message", who, label: `${verb} · ${ago(m as number, nowMs)}` };
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

function firstContactOf(r: PersonRowDto, nowMs: number): PersonFirstContact {
  const f = ts(r.first_contact_at);
  if (f !== null) return { ts: f, label: fmtDate(f, nowMs), estimate: false, evidence: !r.has_backfill };
  const e = ts(r.earliest_row_at);
  if (e !== null && r.has_backfill) return { ts: e, label: `Before ${fmtDate(e, nowMs)}`, estimate: true, evidence: false };
  if (e !== null) return { ts: e, label: fmtDate(e, nowMs), estimate: false, evidence: !r.has_backfill };
  return { ts: null, label: "—", estimate: true, evidence: false };
}

export interface PersonConsent {
  state: "unknown" | "opted_in" | "opted_out";
  dnc: boolean;
  label: string;
  sub: string;
  /** How the answer was given, raw: in_person | phone | form | customer_message | operator | null. */
  source: string | null;
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

/** The words for a source; the reset has none, an unknown one is shown as itself. */
export function consentSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  const known = CONSENT_SOURCES.find((s) => s.id === source);
  if (known) return known.label;
  return source === CONSENT_RESET_SOURCE ? null : source;
}

function consentOf(r: PersonRowDto, nowMs: number): PersonConsent {
  const dnc = !!r.dnc;
  const state: PersonConsent["state"] =
    r.consent === "opted_out" || dnc ? "opted_out" : r.consent === "opted_in" ? "opted_in" : "unknown";
  const when = ts(r.consent_updated_at);
  const date = when !== null ? fmtDate(when, nowMs) : "recorded";
  const how = consentSourceLabel(r.consent_source);
  const sub =
    state === "opted_out"
      ? (r.consent_source === "customer_message"
          ? `STOP received${when !== null ? ` ${fmtDate(when, nowMs)}` : ""}`
          : `${how ? `${how} · ` : ""}${date}`)
    : state === "opted_in" ? `${how ? `${how} · ` : ""}${date}`
    : "no opt-in recorded";
  return {
    state, dnc,
    label: state === "opted_out" ? "Opted out" : state === "opted_in" ? "Opted in" : "Unknown",
    sub,
    source: r.consent_source ?? null,
  };
}

export type ReceptionistTone = "answering" | "escalated" | "queued" | "snoozed" | "paused" | "silent";

export interface PersonReceptionist {
  tone: ReceptionistTone;
  label: string;
}

function receptionistOf(r: PersonRowDto, nowMs: number): PersonReceptionist {
  // A thread a person owns is theirs, whatever flagged it — the Inbox says
  // "you have it" for the same row, and the two must not disagree.
  if (isOwned(r, nowMs)) return { tone: "paused", label: "Paused, a person owns the thread" };
  if (r.open_escalation_reason) return { tone: "escalated", label: `Escalated, ${reasonShort(r.open_escalation_reason)}` };
  if (r.needs_human) return { tone: "escalated", label: "Waiting for a person" };
  if (r.queued_reply_at) return { tone: "queued", label: "Reply queued" };
  const snooze = ts(r.latest_snooze_until);
  if (r.latest_state === "snoozed" && snooze !== null && snooze > nowMs) {
    return { tone: "snoozed", label: `Snoozed until ${shortTime(r.latest_snooze_until, new Date(nowMs))}` };
  }
  if (r.consent === "opted_out" || r.dnc) return { tone: "silent", label: "Silent, they opted out" };
  // "Answering" was shown for a person the owner had set to Never.
  if (r.effective_reply_mode === "never") return { tone: "paused", label: "Held for you, set to Never" };
  if (r.effective_reply_mode === "ask") return { tone: "paused", label: "Held for you, set to Ask" };
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
  consent: PersonConsent;
  /** The customer's last words, verbatim. */
  quote: string | null;
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
}

export function toPersonRowVM(r: PersonRowDto, now = new Date()): PersonRowVM {
  const nowMs = now.getTime();
  const name = personName(r);
  const state = personStateFor(r, nowMs);
  const last = lastContactOf(r, nowMs);
  const first = firstContactOf(r, nowMs);
  const consent = consentOf(r, nowMs);
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
    : state === "quiet" ? (last.ts === null ? "no contact recorded" : `last contact ${ago(last.ts, nowMs)}`)
    : "";
  return {
    id: r.id,
    real: true,
    name,
    givenName: r.display_name?.trim() || null,
    initials: initialsOf(name),
    phone: formatPhoneDisplay(r.phone_e164),
    waName: r.wa_profile_name,
    channels: channelsOf(r),
    hasChat: !!r.has_chat,
    state,
    stateLabel: PERSON_STATE_LABELS[state],
    stateDetail,
    lastContact: last,
    receptionist: receptionistOf(r, nowMs),
    firstContact: first,
    consent,
    quote: r.last_inbound_text?.trim() || null,
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
    replyWindow: r.has_chat
      ? (() => { const w = waWindow(r.latest_wa_inbound_at, now); return { open: w.open, hoursLeft: w.closesAtIso ? Math.max(0, Math.round((new Date(w.closesAtIso).getTime() - nowMs) / 3_600_000)) : 0 }; })()
      : null,
    askedMs,
    askedNotBooked,
    nextVisitMs,
    lastVisitMs,
    nextVisitDays: nextVisitMs !== null ? Math.max(0, Math.ceil((nextVisitMs - nowMs) / DAY_MS)) : null,
    lastVisitDays: lastVisitMs !== null ? Math.max(0, Math.floor((nowMs - lastVisitMs) / DAY_MS)) : null,
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
  // The only people a broadcast may reach: they said yes, and it is on record.
  { id: "opted_in", label: "Can receive offers", group: "reach", test: (v) => v.consent.state === "opted_in" },
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

const LIST_STEPS: Record<string, { cta: string; to: string; broadcast?: boolean; text?: string }> = {
  needs_you: { cta: "Open the Inbox", to: "inbox", text: "Each of them is waiting for a person." },
  waiting_on_you: { cta: "Open the Inbox", to: "inbox", text: "You own these threads, and they wrote last." },
  new_week: { cta: "Get their yes", to: "broadcasts", text: "Their yes to offers is the phrase and the QR on Broadcasts." },
  booked_week: { cta: "See the week", to: "calendar", text: "Their appointments are on the Calendar." },
  asked_never_booked: { cta: "Text the booking link", to: "broadcasts/asked_never_booked", broadcast: true },
  lapsed: { cta: "Win them back", to: "broadcasts/lapsed", broadcast: true },
  quiet: { cta: "Reach out", to: "broadcasts/quiet", broadcast: true },
  opted_in: { cta: "New broadcast", to: "broadcasts", broadcast: true },
};

/**
 * The obvious next step for a list, when it has one. A broadcast reaches
 * only a recorded yes, so the sentence says how many of the list said it,
 * and the button waits until someone has.
 */
export function peopleListAction(id: string, members: PersonRowVM[]): PeopleListAction | null {
  const step = LIST_STEPS[id];
  if (!step) return null;
  if (!step.broadcast) return { text: step.text ?? "", cta: step.cta, to: step.to, enabled: members.length > 0 };
  const yes = members.filter((m) => m.consent.state === "opted_in").length;
  if (yes === 0) return { text: members.length ? "Nobody on this list has said yes yet — a broadcast reaches only a recorded yes." : "Nobody here right now.", cta: step.cta, to: step.to, enabled: false };
  return { text: `${yes} of ${members.length} on this list said yes — a broadcast reaches them.`, cta: step.cta, to: step.to, enabled: true };
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

/* -------------------------------- profile -------------------------------- */

export type TimelineKind = "customer" | "receptionist" | "you" | "system" | "call" | "escalation" | "decision" | "visit";

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

export function toPersonVM(d: PersonDetailDto, now = new Date()): PersonVM {
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
  const base = toPersonRowVM(row, now);
  // A person we know only by number has no first name to shorten to: "+1"
  // as a speaker label is nobody. Keep the whole formatted number.
  const first = /^[+\d(]/.test(base.name) ? base.name : base.name.split(" ")[0] || base.name;
  const stamp = (t: number) => ({ time: TIME_FMT.format(new Date(t)), day: dayLabel(t, nowMs) });
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
      items.push({ id: `m-${m.id}`, ts: t, ...stamp(t), kind, who, text: messageText(m), ...(sub ? { sub } : {}) });
    }
  }

  for (const k of d.calls) {
    const t = ts(k.started_at);
    if (t === null) continue;
    const dur = mmss(k.duration_ms);
    const summary = (k.summary || "").trim();
    const missed = k.status === "not_connected";
    const sentence = missed ? "The call never connected." : summary ? (summary.split(/(?<=[.!?])\s/)[0] ?? summary) : k.in_voicemail ? "Reached voicemail." : "No summary from this call.";
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
      sub: e.state === "resolved" ? "Resolved" : "Open",
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

  // Right now: what the receptionist is doing for this person.
  const threadTo = row.latest_conversation_id ? `inbox/th-${row.latest_conversation_id}` : null;
  const openInbox = threadTo ? { label: "Open in Inbox", to: threadTo } : null;
  const r = row;
  let rightNow: PersonRightNow;
  if (r.open_escalation_reason) {
    const since = r.open_escalation_since ? shortTime(r.open_escalation_since, now) : null;
    rightNow = {
      tone: "escalated",
      title: `Escalated · ${reasonShort(r.open_escalation_reason)}`,
      detail: `${since ? `Since ${since} · ` : ""}the receptionist is paused on this thread until someone answers`,
      cta: openInbox,
    };
  } else if (r.needs_human) {
    rightNow = { tone: "escalated", title: "Waiting for a person", detail: "The receptionist stopped and nobody has taken the thread yet", cta: openInbox };
  } else if (r.queued_reply_at) {
    const q = ts(r.queued_reply_at);
    rightNow = { tone: "queued", title: "Reply sending", detail: `Queued ${q !== null ? ago(q, nowMs) : ""} · it can still be stopped from the Inbox`.replace("  ", " "), cta: openInbox };
  } else if (base.receptionist.tone === "snoozed") {
    rightNow = { tone: "snoozed", title: "Snoozed", detail: `Wakes ${shortTime(r.latest_snooze_until ?? null, now)}`, cta: openInbox };
  } else if (isOwned(r, nowMs)) {
    rightNow = { tone: "paused", title: "Paused, a person owns this thread", detail: "The receptionist will not answer until the thread is handed back", cta: openInbox };
  } else if (base.consent.state === "opted_out") {
    rightNow = { tone: "silent", title: "Silent, they opted out", detail: base.consent.sub, cta: null };
  } else if (["never", "ask"].includes(d.receptionist_mode ?? "") || ["never", "ask"].includes(d.workspace_reply_mode ?? "")) {
    // "Answering" sat two inches from "Receptionist for Dani: Never".
    const theirs = ["never", "ask"].includes(d.receptionist_mode ?? "");
    const mode = theirs ? d.receptionist_mode : d.workspace_reply_mode;
    rightNow = {
      tone: "paused",
      title: `Held for you, set to ${mode === "never" ? "Never" : "Ask"}`,
      detail: theirs
        ? "You set the receptionist to stay out of this person's thread — their messages come straight to you"
        : "Your workspace reply setting holds every message for a person",
      cta: openInbox,
    };
  } else {
    rightNow = { tone: "answering", title: "Answering", detail: "New messages are answered automatically", cta: base.threadId ? { label: "Open thread", to: `inbox/${base.threadId}` } : null };
  }

  // Facts strip.
  const firstIsCall = d.calls.some((k) => k.started_at && ts(k.started_at) === base.firstContact.ts);
  const firstChannel = base.firstContact.estimate ? "imported history" : firstIsCall || !base.hasChat ? "Phone" : "WhatsApp";
  const lc = base.lastContact;
  const lastMeta = lc.who === "they" ? (lc.kind === "call" ? "they phoned" : "they wrote") : lc.who === "you" ? "you replied" : lc.who === "receptionist" ? "receptionist replied" : lc.who === "system" ? "we sent" : "";
  const toneWord: Record<ReceptionistTone, string> = { answering: "Answering", escalated: "Waiting", queued: "Queued", snoozed: "Snoozed", paused: "Paused", silent: "Silent" };
  const facts: PersonFact[] = [
    { label: "First contact", value: base.firstContact.label, meta: firstChannel },
    { label: "Last contact", value: lc.ts !== null ? ago(lc.ts, nowMs) : "—", meta: lastMeta },
    { label: "Conversations", value: base.threads, meta: base.escalations ? `${base.escalations} needed you` : "none needed you" },
    { label: "Calls", value: base.calls, meta: base.calls ? `${Math.max(1, Math.round(base.callSeconds / 60))} min total` : "no calls" },
    { label: "Consent", value: base.consent.label, meta: base.consent.sub, tone: base.consent.state === "opted_out" ? "neg" : "" },
    { label: "Receptionist", value: toneWord[base.receptionist.tone], meta: base.receptionist.tone === "escalated" ? "for you" : base.receptionist.label.toLowerCase() },
  ];

  // About rail.
  const about: { k: string; v: string }[] = [];
  if (base.phone) about.push({ k: "Phone", v: base.phone });
  if (base.waName) about.push({ k: "WhatsApp name", v: base.waName });
  about.push({
    k: "First contact",
    v: base.firstContact.ts !== null
      ? `${base.firstContact.estimate ? "Before " : ""}${DATE_YEAR_FMT.format(new Date(base.firstContact.ts))} · ${firstChannel}`
      : "—",
  });
  about.push({ k: "Channels", v: base.channels.map((c) => (c === "whatsapp" ? "WhatsApp" : "Phone")).join(" · ") || "—" });
  about.push({ k: "Consent", v: `${base.consent.label} · ${base.consent.sub}` });
  if (base.hasChat) {
    const w = waWindow(r.latest_wa_inbound_at, now);
    const hours = w.closesAtIso ? Math.max(0, Math.round((new Date(w.closesAtIso).getTime() - nowMs) / 3_600_000)) : 0;
    about.push({ k: "Reply window", v: w.open ? `Open · ${hours}h left` : "Closed · template only" });
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
    about.push({ k: "Added", v: `${at !== null ? DATE_YEAR_FMT.format(new Date(at)) : "—"} · ${d.added.source === "calendar" ? `from your calendar${d.added.title ? ` (${d.added.title})` : ""}` : "by hand"}` });
  }

  return {
    ...base,
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
  };
}
