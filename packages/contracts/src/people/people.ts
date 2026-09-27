import { agoWords, WEEK_MS, HOUR_MS } from "../shared/time";
import { clockDate, inLocalWeek, localDaysBetween } from "../shared/clock";
import { replyWaitsOnYou, standingOf, type StandingVerdict } from "../conversations/standing";
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
import { formatPhoneDisplay } from "../shared/phone";
import { personName } from "./person-name";
import {
  PERSON_CAME_FROM_WORDS,
  PERSON_CHANNEL_WORDS,
  REPLY_VIA,
  type PersonCameFrom,
  type PersonChannel,
} from "./person-words";
import { isOptedOutContact, type ConsentChange } from "../consent/consent";
import { replyWindow } from "../config/policy";
import type { FollowUpStand } from "../playbooks/playbooks";
import { visitAnswersAsk, visitDateKey, visitDay, visitLine, type PersonVisitsDto } from "../calendar/calendar-people";
import { nextStepOf, stepIsDue, type PersonNextStepVM, type StepColumns } from "../notes/steps";
import { initialsOf, isIdentifierName } from "../conversations/thread-contact";
import { shortTime } from "../conversations/thread-clock";
import type { CallDto } from "../conversations/call-dto";
import type { ConversationDto } from "../conversations/thread-dto";
import {
  dealOf,
  dealStageOf,
  type DealDto,
  type DealPaceDto,
  type DealStandingStage,
  type DealVM,
} from "../deals/deals";
import type { RecipientState } from "../broadcasts/broadcasts";
import { consentSourceLabel, mayReceive, type PersonConsent, saidYesTo } from "./person-consent";
import { fmtDate, MONTH_MS, ts } from "./person-helpers";
import type { PersonNoteDto, PersonNoteTeamDto } from "../notes/person-notes";
export * from "./person-consent";
export * from "../notes/person-notes";
export * from "./people-lists";

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
  /** The newest open or current deal, else the newest of any (people_list, 00156): absent on a row read before the columns existed. */
  deal_id?: string | null;
  deal_stage?: string | null;
  deal_service?: string | null;
  deal_proposed_at?: string | null;
  deal_decided_at?: string | null;
  deal_ended_at?: string | null;
  deal_amount_cents?: number | null;
  deal_per?: string | null;
  /** That deal's link, the day it stands until and why they passed (00160). */
  deal_proposal_url?: string | null;
  deal_valid_until?: string | null;
  deal_lost_reason?: string | null;
  /** Their next step (00166): the earliest open note with a day. Absent on a row read before the columns existed. */
  step_id?: StepColumns["step_id"];
  step_body?: StepColumns["step_body"];
  step_due_on?: StepColumns["step_due_on"];
  step_for_user_id?: StepColumns["step_for_user_id"];
  step_deal_id?: StepColumns["step_deal_id"];
  /** Who that step is for, attached by the API from the team as a note's is: their name, and whether it is the reader. */
  step_for_name?: StepColumns["step_for_name"];
  step_for_me?: StepColumns["step_for_me"];
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
  /** The owner's notes on this person: the field 00157 superseded, still sent for a page loaded before it. */
  notes?: string | null;
  /** Their notes (0007), newest first; absent on a read before the table existed. */
  person_notes?: PersonNoteDto[];
  /** The team, for a note's "For": absent where the team could not be read. */
  note_team?: PersonNoteTeamDto[];
  /**
   * The owner's proposal link on the person (00154). The deal holds it now (0008); this is read only for someone with no
   * deal at all, until the column retires.
   */
  proposal_url?: string | null;
  /** Every deal recorded on them, newest first (0004); absent on a read before the table existed. */
  deals?: DealDto[];
  /** Whether deals are on in this workspace: it says some customers get a proposal first (dealsAreOn, 0008). */
  deals_on?: boolean;
  /** The workspace's pace (00167 deal_pace), where deals are on; absent from a server before it. */
  deal_pace?: DealPaceDto | null;
  /** The profile's service names, for the page's picker when it lists more than one. */
  services?: string[];
  /** The services that need a consultation first (booking_rules.consult_first): which one a consultation was for. */
  consult_first?: string[];
  /** The workspace's booking link, for the profile's one-step send. */
  booking_link?: string | null;
  /** Every change to either answer, newest first: the ledger rows (contact.consent_changed), as evidence. */
  consent_history?: ConsentChange[];
  /** The runs that named this person, newest first: a playbook's, or a broadcast someone sent (broadcast_recipients). */
  campaigns?: PersonCampaignDto[];
  /** The lead this person was found as, when they were one (leads.contact_id). */
  lead?: PersonLeadDto | null;
}

/** One run that named a person: what went, when, and what became of it at the wire. */
export interface PersonCampaignDto {
  broadcast_id: string;
  /** The run's own name, as its sender gave it or the sweep named it. */
  name: string;
  /** The playbook whose run it was, and the playbook's name then; both null for a broadcast someone sent. */
  playbook_id: string | null;
  playbook_name: string | null;
  state: RecipientState;
  /** Why they were held back or not reached, as the send job recorded it (HELD_REASONS). */
  reason: string | null;
  sent_at: string | null;
  /** When the run was due: what a row that never went out is dated by. */
  scheduled_for: string | null;
  /** The message it sent them, which names the thread a reply is looked for in. */
  message_id: string | null;
}

/** The lead a person was found as: the place the finder found, before they wrote or were called. */
export interface PersonLeadDto {
  id: string;
  business_name: string;
  found_at: string;
}

/** One run on a person's page: what it was, when, and what became of it. */
export interface PersonCampaignVM {
  id: string;
  kind: "playbook" | "broadcast";
  /** The playbook's name for its run, or the broadcast's own. */
  title: string;
  /** "Sep 3", by the business's clock. */
  when: string;
  /** What became of it: "Replied", "Sent", "Held — no yes to offers", "Didn't send", "Waiting to send". */
  outcome: string;
  /** The line under the title, in Broadcasts' history words: "Playbook · Replied", "Broadcast · Sent". */
  line: string;
  tone: "ok" | "plain" | "warn";
  /** The run's own report. */
  to: string;
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
export const PERSON_MODE_WORDS: Record<PersonMode | "inherit", string> = {
  ...PERSON_MODE_LABELS,
  inherit: "Follow the workspace",
};

export function asPersonMode(s: string | null | undefined): PersonMode | null {
  return s && (PERSON_MODES as readonly string[]).includes(s) ? (s as PersonMode) : null;
}

/* -------------------------------- states --------------------------------- */

export type PersonState = "needs_you" | "waiting_on_you" | "opted_out" | "new" | "quiet" | "active" | "unheard";

export const PERSON_STATE_LABELS: Record<PersonState, string> = {
  needs_you: "Needs you",
  waiting_on_you: "Waiting on you",
  opted_out: "Opted out",
  new: "New",
  quiet: "Quiet",
  active: "Active",
  unheard: "Not heard from",
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
/** First contact this many of the workspace's days ago or fewer, on a real date, is "new" (New this week's rule). */
export const NEW_WINDOW_DAYS = 7;
/** Heard from, then nothing from them for more than this many days, is "quiet" (Quiet 30+ days' rule). */
export const QUIET_AFTER_DAYS = 30;

/**
 * The escalation reasons in the words an owner uses across a table row.
 * ESCALATION_REASON_LABELS in conversations/escalations.ts are sentences for Today's headlines;
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

/** "just now" · "5m ago" · "3h ago" · "2d ago", the business's date past a week — the one family (time.ts, clock.ts). */
export function ago(ms: number, tz: string, nowMs: number): string {
  return agoWords(ms, nowMs, { dateAfterMs: WEEK_MS, date: (at) => clockDate(at, tz, nowMs) });
}

// What to call a person is person-name.ts's one rule; People reads it from there
// like every other surface, and the index exports it from there.
export { personName };
// A person's wires and where they came from, in words: the leaf the list rules read too (person-words.ts).
export { PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS, type PersonCameFrom, type PersonChannel };

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
  if (replyVia === "Email")
    return {
      label: "Email the booking link",
      title: "Opens the thread with the link ready to send by email",
      ready: true,
    };
  if (replyVia === "Text")
    return {
      label: "Text the booking link",
      title: "Opens the thread with the link ready to send as a text",
      ready: true,
    };
  if (win && win.open)
    return {
      label: "Text the booking link",
      title: `Opens the thread with the link ready to send · any message for ${win.hoursLeft}h more`,
      ready: true,
    };
  return {
    label: "Send the booking link",
    title: "Only an approved message reaches them until they write again; their thread offers the one with the link",
    ready: false,
  };
}

/** The owner's proposal for a person (00154), for the page: the address, where it lives, and whether it went out. */
export interface PersonProposalVM {
  url: string;
  host: string;
  /** The newest message that carried the address and went out: when, and on which wire. */
  sent: { at: string; via: string | null } | null;
}

/** The words the one-step send carries into the composer — once, for the page and the thread. */
export function proposalMessage(url: string): string {
  return `Here's the proposal we put together for you: ${url}`;
}

/**
 * What the send-the-proposal button says, by the wire a reply goes out on:
 * bookingLinkAction's twin. Nothing is sent from the button: it opens the
 * thread with the address ready in the composer. There is no template for a
 * proposal, so where WhatsApp's window has shut there is no button (`ready`
 * false) -- the About rail's Replies row already says why. "again" once
 * the address has gone out, so the page says what it knows without a second line.
 */
export function proposalAction(
  replyVia: "WhatsApp" | "Text" | "Email" | null,
  win: { open: boolean; hoursLeft: number } | null,
  sentWords: string | null,
): { label: string; title: string; ready: boolean } {
  const again = sentWords ? " again" : "";
  const sent = sentWords ? ` · sent ${sentWords}` : "";
  if (replyVia === "Email")
    return {
      label: `Email the proposal${again}`,
      title: `Opens the thread with the proposal link ready to send by email${sent}`,
      ready: true,
    };
  if (replyVia === "Text")
    return {
      label: `Text the proposal${again}`,
      title: `Opens the thread with the proposal link ready to send as a text${sent}`,
      ready: true,
    };
  if (win && win.open)
    return {
      label: `Send the proposal${again}`,
      title: `Opens the thread with the proposal link ready to send · any message for ${win.hoursLeft}h more${sent}`,
      ready: true,
    };
  return {
    label: "Send the proposal",
    title: "Only an approved message reaches them until they write again, so the proposal waits until they do",
    ready: false,
  };
}

/**
 * What a reply to them may be, in the owner's words: the person page's Replies and the Pipeline peek's, one sentence.
 * WhatsApp takes any message for a day after they last wrote, and after that only a message WhatsApp approved ahead
 * of time; a text or an email goes any time. It said "Reply window · Closed · template only", and before it was
 * channel-aware it said so to a person who had only ever emailed. Null with no wire a reply goes out on.
 */
export function repliesWords(
  via: "WhatsApp" | "Text" | "Email" | null,
  window: { open: boolean; hoursLeft: number } | null,
): string | null {
  if (via === "Email") return "Any time, by email";
  if (via === "Text") return "Any time, by text";
  if (via !== "WhatsApp" || !window) return null;
  if (!window.open) return "Approved messages only, until they write again";
  const h = window.hoursLeft;
  return h >= 1 ? `Any message, for ${h} more ${h === 1 ? "hour" : "hours"}` : "Any message, for less than an hour";
}

/** A row's came_from in words, or null: nothing known, a row read before 00138, or a value this build does not know. */
export function cameFromOf(r: { came_from?: string | null }): { key: PersonCameFrom; label: string } | null {
  const k = r.came_from;
  if (!k || !Object.prototype.hasOwnProperty.call(PERSON_CAME_FROM_WORDS, k)) return null;
  return { key: k as PersonCameFrom, label: PERSON_CAME_FROM_WORDS[k as PersonCameFrom] };
}

type StandingRow = Pick<
  PersonRowDto,
  "latest_state" | "latest_paused_until" | "latest_assignee_user_id" | "needs_human" | "open_escalation_reason"
>;

/**
 * The latest thread's standing, from the one rule every surface reads (standing.ts), for `viewerId` when someone is
 * looking: a teammate's claim is theirs. With no one looking a claim reads as mine, as standing.ts reads an unknown.
 */
export function personStanding(r: StandingRow, nowMs: number, viewerId: string | null = null): StandingVerdict {
  return standingOf(
    {
      state:
        r.latest_state === "snoozed"
          ? "snoozed"
          : r.needs_human || r.latest_state === "needs_human"
            ? "needs_human"
            : (r.latest_state ?? "open"),
      paused_until: r.latest_paused_until,
      assignee_user_id: r.latest_assignee_user_id,
      assignee_is_me: viewerId && r.latest_assignee_user_id ? r.latest_assignee_user_id === viewerId : undefined,
      open_escalation: !!r.open_escalation_reason,
    },
    nowMs,
  );
}

/**
 * Whose attention a person's latest thread asks for, judged for `viewerId` (decision 0009): it needs you -- flagged
 * and nobody has it, or a reply counting down to send (standing.ts replyWaitsOnYou, as the Inbox counts it) -- or it
 * waits on you: you have it, or nobody is named on it and someone's reply paused the receptionist, and it is flagged
 * or they wrote last. A teammate's thread waits on them. People's Needs you and Waiting on you lists, and the row's
 * pill, are this.
 */
export function attentionOf(
  r: PersonRowDto,
  nowMs: number,
  viewerId: string | null = null,
): "needs_you" | "waiting_on_you" | null {
  const v = personStanding(r, nowMs, viewerId);
  if (v.standing === "needs_you" || replyWaitsOnYou({ queued: !!r.queued_reply_at }, nowMs)) return "needs_you";
  const assignee = r.latest_assignee_user_id;
  // With no one looking, an assignee reads as you (standing.ts): a row that cannot say whose claim it is does not
  // accuse a teammate.
  const owned = assignee ? !viewerId || assignee === viewerId : v.takenOver;
  if (owned && (v.flagged || r.last_message_direction === "inbound")) return "waiting_on_you";
  return null;
}

/** When they last wrote or called: their message, or a call they placed. A call the owner made is not them asking. */
function heardAt(r: PersonRowDto): number | null {
  const at = [ts(r.last_inbound_at), ts(r.last_inbound_call_at ?? null)].filter((x): x is number => x !== null);
  return at.length ? Math.max(...at) : null;
}

/** A person has the thread: they claimed it, or their own reply paused the receptionist. */
export function isOwned(r: StandingRow, nowMs: number): boolean {
  return !!r.latest_assignee_user_id || personStanding(r, nowMs).takenOver;
}

/* ------------------------------ the rule --------------------------------- */

/**
 * The row's pill: the first of these that holds. It says the lists' own facts (decision 0009), so a row's pill never
 * disagrees with the list it is on: whose attention it asks (attentionOf), a stop, new by New this week's rule, never
 * heard from, quiet by Quiet 30+ days' rule, else active. Days are the workspace's own dates (`tz`).
 */
export function personStateFor(
  r: PersonRowDto,
  nowMs: number,
  tz: string,
  viewerId: string | null = null,
): PersonState {
  const attention = attentionOf(r, nowMs, viewerId);
  if (attention) return attention;
  if (isOptedOutContact({ consent: r.consent, dnc: r.dnc })) return "opted_out";
  const first = firstContactOf(r, tz, nowMs);
  if (first.evidence && first.ts !== null && localDaysBetween(first.ts, nowMs, tz) <= NEW_WINDOW_DAYS) return "new";
  const heard = heardAt(r);
  if (heard === null) return "unheard";
  if (localDaysBetween(heard, nowMs, tz) > QUIET_AFTER_DAYS) return "quiet";
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
    r.last_message_direction === "inbound"
      ? "they"
      : r.last_message_sender === "human"
        ? "you"
        : r.last_message_sender === "ai"
          ? "receptionist"
          : "system";
  const verb =
    who === "they"
      ? "They wrote"
      : who === "you"
        ? "You replied"
        : who === "receptionist"
          ? "Receptionist replied"
          : "We sent";
  return {
    ts: m as number,
    at: r.last_message_at,
    kind: "message",
    who,
    label: `${verb} · ${ago(m as number, tz, nowMs)}`,
  };
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
  if (e !== null && r.has_backfill)
    return { ts: e, label: `Before ${fmtDate(e, tz, nowMs)}`, estimate: true, evidence: false };
  if (e !== null) return { ts: e, label: fmtDate(e, tz, nowMs), estimate: false, evidence: !r.has_backfill };
  return { ts: null, label: "—", estimate: true, evidence: false };
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
      ? r.consent_source === "customer_message"
        ? `STOP received${when !== null ? ` ${fmtDate(when, tz, nowMs)}` : ""}`
        : `${how ? `${how} · ` : ""}${date}`
      : state === "opted_in"
        ? `${how ? `${how} · ` : ""}${date}`
        : "no opt-in recorded";
  // The offers answer, judged on its own. A STOP or a do-not-call stops
  // everything, so it shows here as opted_out too -- but declining offers never
  // reads back as an opt-out of conversation.
  const marketing: PersonConsent["marketing"] =
    dnc || r.consent === "opted_out"
      ? "opted_out"
      : r.marketing_consent === "opted_in"
        ? "opted_in"
        : r.marketing_consent === "opted_out"
          ? "opted_out"
          : "unknown";
  const mWhen = ts(r.marketing_consent_updated_at ?? null);
  const mHow = consentSourceLabel(r.marketing_consent_source ?? null);
  const marketingSub =
    marketing === "opted_in"
      ? `${mHow ? `${mHow} · ` : ""}${mWhen !== null ? fmtDate(mWhen, tz, nowMs) : "recorded"}`
      : marketing === "opted_out"
        ? "no offers"
        : "never asked about offers";
  return {
    state,
    dnc,
    label: state === "opted_out" ? "Opted out" : state === "opted_in" ? "Opted in" : "Unknown",
    // The answer in the words its own control uses (Yes, Not asked, No), as marketingLabel is the offers answer's.
    answerLabel: state === "opted_in" ? "Yes" : state === "opted_out" ? "No" : "Not asked",
    sub,
    source: r.consent_source ?? null,
    marketing,
    marketingSource: r.marketing_consent_source ?? null,
    marketingSub,
    // The offers answer in the words People's Offers column uses, so a list and the page agree.
    marketingLabel: marketing === "opted_in" ? "Yes" : marketing === "opted_out" ? "No" : "Not asked",
  };
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
  if (r.open_escalation_reason)
    return { tone: "escalated", label: `Escalated, ${reasonShort(r.open_escalation_reason)}` };
  if (r.needs_human) return { tone: "escalated", label: "Waiting for a person" };
  if (r.queued_reply_at) return { tone: "queued", label: "Reply queued" };
  const snooze = ts(r.latest_snooze_until);
  if (r.latest_state === "snoozed" && snooze !== null && snooze > nowMs) {
    return { tone: "snoozed", label: `Snoozed until ${shortTime(r.latest_snooze_until, tz, new Date(nowMs))}` };
  }
  if (r.consent === "opted_out" || r.dnc) return { tone: "silent", label: "Silent, they opted out" };
  // "Answering" was shown for a person the owner had set to Never.
  if (r.effective_reply_mode === "never")
    return { tone: "paused", label: `Held for you, set to ${PERSON_MODE_WORDS.never}` };
  if (r.effective_reply_mode === "ask")
    return { tone: "paused", label: `Held for you, set to ${PERSON_MODE_WORDS.ask}` };
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
  /**
   * Wrote or called in the last 30 days, and nothing on the calendar answers it: a visit ahead, or one since they
   * asked (calendar-people.ts visitAnswersAsk, Reports' rule too).
   */
  askedNotBooked: boolean;
  nextVisitMs: number | null;
  lastVisitMs: number | null;
  /** The workspace's days until the next appointment (0 = today); null without one. */
  nextVisitDays: number | null;
  /** The workspace's days since the last visit; null without one. */
  lastVisitDays: number | null;
  /** The next visit falls in this week, Monday to Sunday, by the workspace's clock. */
  nextVisitThisWeek: boolean;
  /** The workspace's days since they last wrote or called (askedMs); null when they never have. */
  heardDays: number | null;
  /** The workspace's days since first contact; null without one. `firstContact.evidence` says it is a real date. */
  firstDays: number | null;
  /** Whose attention their latest thread asks for, judged for the viewer the row was built for (attentionOf). */
  standing: "needs_you" | "waiting_on_you" | null;
  /**
   * Who has their latest thread: the viewer, a teammate, or nobody; "someone" when it has an assignee and the row was
   * built for no one looking, so "me" cannot be said.
   */
  assigned: "me" | "teammate" | "nobody" | "someone";
  /** Where they stand on the way to a deal, as the Pipeline groups them (deals.ts dealStageOf); null for none. */
  dealStage: DealStandingStage | null;
  /** Said the yes each purpose needs, a number to send to or not (saidYesTo). */
  saidYes: { offers: boolean; messages: boolean };
  /** May be sent each: the yes and a number (mayReceive). */
  canReceive: { offers: boolean; messages: boolean };
  /** Asked to stop, or on the do-not-contact list (consent.ts isOptedOutContact). */
  stopped: boolean;
  /** Their next step's day has come (steps.ts stepIsDue). */
  stepDue: boolean;
  /** "2026-09-08": the day of the next / last visit by the calendar's own clock — what a day-keyed playbook reads. */
  nextVisitDate: string | null;
  lastVisitDate: string | null;
  /** The calendar's zone; null without a calendar. */
  calendarTz: string | null;
  /** Their deal, as the page says it (0004); null where none was recorded. */
  deal: DealVM | null;
  /** The next or the last visit was a consultation (0004): the "Consultation booked" list. */
  consultationVisit: boolean;
  /** When their last visit ended, when it was a consultation (0008): the next step is a proposal. Null otherwise. */
  consultedMs: number | null;
  /**
   * That consultation's title as the calendar wrote it: the last visit's when it was one, else the next's; null
   * otherwise. The service it names says which of their deals it began (the deal card's Consultation step, 0008).
   */
  consultationTitle: string | null;
  /** Their next visit, when it is a consultation (0008): when it starts, and whether it takes the day. Null otherwise. */
  consultAhead: { startMs: number; allDay: boolean } | null;
  /** Their next step (0007, amended): the earliest open note with a day; null without one. */
  nextStep: PersonNextStepVM | null;
  /**
   * Where they stand with the proposal follow-up (0006, playbooks.ts followUpStandOf): laid on by the People surface
   * from the follow-up's facts, where one runs; null otherwise, and on a row read anywhere else.
   */
  followUp: FollowUpStand | null;
}

/**
 * A visit's title as a calendar wrote it, without the person's own name at its end: a booking app titles an
 * appointment "Consultation · Tom Baker", and on Tom's page and his row the name is said already. Only the whole name,
 * next to a separator, at either end, goes; a title that is the name alone, or says anything else, is the calendar's.
 */
export function visitTitleFor(title: string, name: string): string {
  const n = name.trim().toLowerCase();
  if (!n || isIdentifierName(name)) return title;
  const t = title.trim();
  const low = t.toLowerCase();
  // At its end: what comes before the name ends in a separator, so the name is a part of its own.
  if (low.endsWith(n)) {
    const m = t.slice(0, t.length - n.length).match(/^(.*\S)\s*[·•|:,\-–—]\s*$/);
    if (m) return m[1].trim();
  }
  // Or at its start ("Maria Lopez - Balayage"), with a separator after it.
  if (low.startsWith(n)) {
    const m = t.slice(n.length).match(/^\s*[·•|:,\-–—]\s*(\S.*)$/);
    if (m) return m[1].trim();
  }
  return title;
}

/**
 * A People row, as it reads at `now` for `viewerId` (the member looking; null for a playbook's run, which has no one):
 * its words, and the facts a list's rule reads (list-rules.ts), each worked out once here in the workspace's own dates.
 */
export function toPersonRowVM(
  r: PersonRowDto,
  tz: string,
  now = new Date(),
  viewerId: string | null = null,
): PersonRowVM {
  const nowMs = now.getTime();
  const name = personName(r);
  const state = personStateFor(r, nowMs, tz, viewerId);
  const last = lastContactOf(r, tz, nowMs);
  const first = firstContactOf(r, tz, nowMs);
  const consent = consentOf(r, tz, nowMs);
  // Booked is a fact from the calendar, not a stage: an appointment ahead.
  // Asked-not-booked is the gap the owner can act on — they reached out
  // this month and the calendar has never had them.
  const v = r.visits ?? null;
  const calendar = v ? v.state : "none";
  // Their message, or the call they placed. A call the owner made is not them asking.
  const askedMs = heardAt(r);
  const booked = !!v?.next;
  const nextVisitMs = v?.next ? Date.parse(v.next.start) : null;
  const lastVisitMs = v?.last ? Date.parse(v.last.start) : null;
  const askedNotBooked =
    calendar === "ok" &&
    askedMs !== null &&
    nowMs - askedMs <= MONTH_MS &&
    !visitAnswersAsk(
      nextVisitMs !== null && Number.isFinite(nextVisitMs) ? nextVisitMs : null,
      lastVisitMs !== null && Number.isFinite(lastVisitMs) ? lastVisitMs : null,
      askedMs,
    );
  const stateDetail =
    state === "needs_you"
      ? r.open_escalation_reason
        ? reasonShort(r.open_escalation_reason)
        : r.queued_reply_at && personStanding(r, nowMs).standing !== "needs_you"
          ? "a reply is about to send — you can still stop it"
          : "waiting for a person"
      : state === "waiting_on_you"
        ? "you own the thread and they wrote last"
        : state === "opted_out"
          ? consent.sub
          : state === "new"
            ? `first contact ${first.label}`
            : state === "quiet"
              ? `last heard from ${ago(askedMs as number, tz, nowMs)}`
              : state === "unheard"
                ? last.ts === null
                  ? "no contact recorded"
                  : "they have not written or called"
                : "";
  const vm: PersonRowVM = {
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
    nextVisit: v?.next ? `${visitLine(v.next, v.timezone, nowMs)} · ${visitTitleFor(v.next.title, name)}` : null,
    lastVisit: v?.last ? `${visitLine(v.last, v.timezone, nowMs)} · ${visitTitleFor(v.last.title, name)}` : null,
    lastVisitDay: v?.last ? visitDay(v.last.start, v.timezone, nowMs) : null,
    // Channel-aware: only WhatsApp has a window (policy replyWindow). This read
    // WhatsApp's for everybody, so a person who had only ever emailed was shown
    // "Closed · template only" -- a template they cannot receive, on a wire
    // they have never used.
    ...(() => {
      const via = replyChannelOfRow(r);
      if (!via) return { replyWindow: null, replyVia: null, bookingLinkAction: bookingLinkAction(null, null) };
      const w = replyWindow(via, r.latest_wa_inbound_at, now);
      const win = {
        open: w.open,
        hoursLeft: w.closesAtIso ? Math.max(0, Math.round((new Date(w.closesAtIso).getTime() - nowMs) / HOUR_MS)) : 0,
      };
      return { replyWindow: win, replyVia: REPLY_VIA[via], bookingLinkAction: bookingLinkAction(REPLY_VIA[via], win) };
    })(),
    channelWords: channelsOf(r)
      .map((c) => PERSON_CHANNEL_WORDS[c])
      .join(" · "),
    askedMs,
    askedNotBooked,
    nextVisitMs,
    lastVisitMs,
    nextVisitDays: nextVisitMs !== null ? Math.max(0, localDaysBetween(nowMs, nextVisitMs, tz)) : null,
    lastVisitDays: lastVisitMs !== null ? Math.max(0, localDaysBetween(lastVisitMs, nowMs, tz)) : null,
    nextVisitThisWeek: nextVisitMs !== null && Number.isFinite(nextVisitMs) && inLocalWeek(nextVisitMs, tz, nowMs),
    heardDays: askedMs !== null ? Math.max(0, localDaysBetween(askedMs, nowMs, tz)) : null,
    firstDays: first.ts !== null ? Math.max(0, localDaysBetween(first.ts, nowMs, tz)) : null,
    standing: state === "needs_you" || state === "waiting_on_you" ? state : null,
    assigned: !r.latest_assignee_user_id
      ? "nobody"
      : !viewerId
        ? "someone"
        : r.latest_assignee_user_id === viewerId
          ? "me"
          : "teammate",
    saidYes: { offers: saidYesTo({ consent }, "marketing"), messages: saidYesTo({ consent }, "conversational") },
    canReceive: {
      offers: mayReceive({ consent, phone: r.phone_e164 }, "marketing"),
      messages: mayReceive({ consent, phone: r.phone_e164 }, "conversational"),
    },
    stopped: isOptedOutContact({ consent: r.consent, dnc: r.dnc }),
    nextVisitDate: v?.next ? visitDateKey(v.next.start, v.timezone) : null,
    lastVisitDate: v?.last ? visitDateKey(v.last.start, v.timezone) : null,
    calendarTz: v?.timezone ?? null,
    deal: dealOf(r, tz, nowMs),
    consultationVisit: !!(v?.next?.consultation || v?.last?.consultation),
    consultedMs: v?.last?.consultation ? ts(v.last.end) : null,
    consultationTitle: v?.last?.consultation ? v.last.title : v?.next?.consultation ? v.next.title : null,
    consultAhead:
      v?.next?.consultation && nextVisitMs !== null && Number.isFinite(nextVisitMs)
        ? { startMs: nextVisitMs, allDay: !!v.next.all_day }
        : null,
    nextStep: nextStepOf(r, tz, nowMs),
    stepDue: stepIsDue(nextStepOf(r, tz, nowMs)),
    dealStage: null,
    followUp: null,
  };
  // The Pipeline's group for them, from the deal and the consultations just read: one rule for both pages.
  vm.dealStage = dealStageOf(vm, nowMs);
  return vm;
}

/**
 * Whether the page may reach them at all: a conversation to write in, no stop, and no do-not-contact. It is not
 * whether free text can go now (proposalAction's and bookingLinkAction's `ready`): where WhatsApp takes only an
 * approved message, their thread offers one. Every send the page offers asks this one rule: the More menu's
 * (personActs) and the deal card's (deal-sheet.ts dealSendOf).
 */
export function mayReach(p: { openThread: string | null; consent: { state: string; dnc: boolean } }): boolean {
  return !!p.openThread && p.consent.state !== "opted_out" && !p.consent.dnc;
}
