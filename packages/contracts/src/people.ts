import { agoWords } from "./time";
import { clockDate, clockDateYear, clockDayLabel, clockShort, clockTime } from "./clock";
import { linkHost } from "./link";
import { replyWaitsOnYou, standingOf, type StandingVerdict } from "./standing";
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
  forWords,
  nextStepOf,
  stepDayOf,
  type PersonNextStepVM,
  type StepColumns,
  type StepDayVM,
  type StepDue,
} from "./steps";
import {
  initialsOf,
  isIdentifierName,
  writtenChannelOf,
  messageAt,
  messageAuthor,
  messageText,
  messageWords,
  shortTime,
  type CallDto,
  type ConversationDto,
  type MessageDto,
} from "./viewmodels";
import { HELD_REASONS, isReplyTo } from "./run-words";
import { leadsRoute } from "./leads";
import {
  DEAL_ACT_WORDS,
  DEAL_LOST_REASON_WORDS,
  DEAL_STAGE_WORDS,
  amountWords,
  dealOf,
  isDealLostReason,
  proposalLinkOf,
  toDealVM,
  type DealDto,
  type DealVM,
} from "./deals";
import type { RecipientState } from "./broadcasts";

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

/** One note on a person, as the person read sends it (0007, 00157): its words, who wrote it and when, who it is for. */
export interface PersonNoteDto {
  id: string;
  body: string;
  author_kind: "member" | "receptionist";
  /** The author's name on the team; null for the receptionist, and for a member no longer on the team. */
  author_name: string | null;
  /** The reader wrote it. */
  mine: boolean;
  for_user_id: string | null;
  /** The name of the member it is for; null when it is for everyone, or they have left the team. */
  for_name: string | null;
  /** It is for the reader. */
  for_me: boolean;
  /** For the team only: the receptionist never reads it. */
  team_only: boolean;
  /** The receptionist's own note waits for a member to keep it or dismiss it. */
  state: "kept" | "suggested";
  source: "page" | "bulk" | "moved" | "call" | "thread";
  version: number;
  created_at: string;
  updated_at: string;
  /** Its day, when it is a step (00166): by the business's calendar. Absent on a read before the column existed. */
  due_on?: string | null;
  /** When the step was done, and by whom: their name on the team, and whether it was the reader. */
  done_at?: string | null;
  done_by_name?: string | null;
  done_by_me?: boolean;
  /** The deal it moves, when it names one. */
  deal_id?: string | null;
}

/** A member of the team a note can be for, the reader marked. */
export interface PersonNoteTeamDto {
  id: string;
  name: string;
  me: boolean;
}

/** One note on the person's page. Every word is here; the page composes. */
export interface PersonNoteVM {
  id: string;
  body: string;
  /** "You", their name on the team, "A former teammate", or "The receptionist". */
  who: string;
  /** "2:10 PM" on the business's today, "Sep 23" before it; `whenFull` is the date with its year and the time. */
  when: string;
  whenFull: string;
  /** "For you", or "For Maria"; null when it is for everyone. */
  forWho: string | null;
  forMe: boolean;
  forUserId: string | null;
  teamOnly: boolean;
  /** The receptionist's suggestion, waiting for Keep or Dismiss; `from` says what it came out of. */
  suggested: boolean;
  from: string | null;
  /** The reader wrote it, so the reader may change it. An owner may take away any note; the page knows its role. */
  mine: boolean;
  /** Changed after it was written. */
  edited: boolean;
  version: number;
  /**
   * Its day, when it is a step (0007, amended): the day as every page says it, "Due Thu" or "Done", and, done, who
   * did it and when. Null for a note.
   */
  step: { day: StepDayVM; due: StepDue; words: string; done: boolean; doneWords: string | null } | null;
  /** The deal it moves, when it names one. */
  dealId: string | null;
}

/** How long a note may be, in characters: the table's CHECK (00157). */
export const NOTE_MAX = 600;

/** The notes card's words, once. */
export const NOTE_WORDS = {
  title: "Notes",
  placeholder: "Add a note…",
  add: "Add note",
  save: "Save",
  cancel: "Cancel",
  edit: "Edit",
  remove: "Delete",
  askRemove: "Delete this note?",
  more: "More for this note",
  edited: "edited",
  forAnyone: "For anyone",
  forLabel: "For",
  teamOnly: "Team only",
  teamOnlyHint: "The receptionist won't read it",
  readsHint: "The receptionist uses notes as facts and never reads them aloud.",
  none: "No notes yet.",
  suggested: "Suggested by the receptionist",
  keep: "Keep",
  dismiss: "Dismiss",
  added: "Note added",
  saved: "Note saved",
  removed: "Note deleted",
  kept: "Kept: the receptionist uses it from now on",
  dismissed: "Dismissed",
  showAll: (n: number) => `Show all ${n}`,
  showFewer: "Show fewer",
  left: (n: number) => `${n} left`,
  // A note with a day is a step (0007, amended).
  addDay: "Add a day",
  due: "Due",
  noDay: "No day",
  pickDay: "Pick a day",
  done: "Done",
  undo: "Undo",
  change: "Change",
  stepTeamOnly: "A step is for the team only",
  setNext: "Set a next step",
  next: "Next step",
  stepsDue: "Steps due",
  stepAdded: "Step added",
  stepSaved: "Step saved",
  stepDone: "Step done",
  stepReopened: "Step open again",
  setTheNext: "Set the next one",
} as const;

/** A door's refusal, in the owner's words (00157's error keys). */
export const NOTE_REFUSALS: Record<string, string> = {
  empty: "Write something first.",
  too_long: `A note is at most ${NOTE_MAX} characters.`,
  not_found: "This person or this note is no longer here.",
  not_a_member: "That person is not on the team.",
  not_yours: "Only the person who wrote this note can change it.",
  moved: "Someone changed this note since you opened it. Read it again, then save.",
  decided: "Someone already decided on this suggestion.",
  bad_source: "Could not save this note.",
  bad_deal: "That deal is not this person's.",
  not_a_step: "Only a note with a day can be done.",
};

const NOTE_FROM: Record<PersonNoteDto["source"], string | null> = {
  page: null,
  bulk: null,
  moved: null,
  call: "After a call",
  thread: "After a conversation",
};

/** A note's step: its day, and once done, who did it and when ("Done by Maria · Sep 24"). Null for a note. */
function noteStepOf(n: PersonNoteDto, tz: string, nowMs: number): PersonNoteVM["step"] {
  const day = stepDayOf(n.due_on, tz, nowMs);
  if (!day) return null;
  const doneMs = n.done_at ? Date.parse(n.done_at) : NaN;
  if (!Number.isFinite(doneMs)) return { day, due: day.due, words: day.words, done: false, doneWords: null };
  const who = n.done_by_me ? "you" : (n.done_by_name ?? "").trim() || "a former teammate";
  return {
    day,
    due: day.due,
    words: NOTE_WORDS.done,
    done: true,
    doneWords: `${NOTE_WORDS.done} by ${who} · ${clockShort(doneMs, tz, nowMs)}`,
  };
}

/**
 * A person's notes for their page (0007): the receptionist's suggestions first, since they wait for someone, then
 * every note newest first. Who wrote each is the reader ("You"), a name on the team, a member who has left, or the
 * receptionist; who it is for is the reader ("For you") or a name.
 */
export function personNotesVM(
  notes: readonly PersonNoteDto[] | null | undefined,
  tz: string,
  nowMs: number,
): PersonNoteVM[] {
  const at = (iso: string) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : nowMs;
  };
  return [...(notes ?? [])]
    .sort(
      (a, b) =>
        Number(b.state === "suggested") - Number(a.state === "suggested") || at(b.created_at) - at(a.created_at),
    )
    .map((n) => {
      const t = at(n.created_at);
      return {
        id: n.id,
        body: n.body,
        who:
          n.author_kind === "receptionist"
            ? "The receptionist"
            : n.mine
              ? "You"
              : (n.author_name ?? "").trim() || "A former teammate",
        when: clockShort(t, tz, nowMs),
        whenFull: `${clockDateYear(t, tz)} · ${clockTime(t, tz)}`,
        forWho: forWords(n.for_me, n.for_user_id, n.for_name),
        forMe: n.for_me,
        forUserId: n.for_user_id,
        teamOnly: n.team_only,
        suggested: n.state === "suggested",
        from: n.author_kind === "receptionist" ? NOTE_FROM[n.source] : null,
        mine: n.mine && n.author_kind === "member",
        edited: n.version > 1 && n.state === "kept" && n.author_kind === "member",
        version: n.version,
        step: noteStepOf(n, tz, nowMs),
        dealId: n.deal_id ?? null,
      };
    });
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

/** How a reply goes, in the words the page uses for the wire. */
const REPLY_VIA: Record<"whatsapp" | "sms" | "email", "WhatsApp" | "Text" | "Email"> = {
  whatsapp: "WhatsApp",
  sms: "Text",
  email: "Email",
};

/** A channel in the owner's words. */
export const PERSON_CHANNEL_WORDS: Record<PersonChannel, string> = {
  whatsapp: "WhatsApp",
  sms: "Text",
  voice: "Phone",
  email: "Email",
};

/**
 * The newest message that carried the proposal's address and went out -- a
 * status that is not queued, canceled or failed, the rule people_list calls
 * spoken. Derived from the messages the page already reads, so "sent" is never
 * a stored flag that can disagree with the thread.
 */
function proposalSent(conversations: ReadonlyArray<ConversationDto>, url: string): PersonProposalVM["sent"] {
  let best: { at: number; iso: string; channel: string | null } | null = null;
  for (const c of conversations) {
    for (const m of c.messages) {
      if (m.direction !== "outbound" || !m.body || !m.body.includes(url)) continue;
      if (m.status && ["queued", "canceled", "failed"].includes(m.status)) continue;
      const iso = m.channel_ts ?? m.created_at;
      const at = Date.parse(iso);
      if (Number.isFinite(at) && (!best || at > best.at)) best = { at, iso, channel: m.channel ?? null };
    }
  }
  if (!best) return null;
  const via =
    best.channel && best.channel in PERSON_CHANNEL_WORDS ? PERSON_CHANNEL_WORDS[best.channel as PersonChannel] : null;
  return { at: best.iso, via };
}

/**
 * Whether a message carrying the proposal's address is still on its way: queued, in the seconds its send can be
 * undone. The deal card says "Sending" and offers no second send until it has gone (0008).
 */
function proposalSending(conversations: ReadonlyArray<ConversationDto>, url: string): boolean {
  return conversations.some((c) =>
    c.messages.some((m) => m.direction === "outbound" && m.status === "queued" && !!m.body && m.body.includes(url)),
  );
}

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

/**
 * Who added a person and how, from their first contact.added event (PersonDetailDto.added), read as
 * people_list reads it for came_from (00138): 'calendar' is the calendar sweep, 'lead' the lead finder
 * (00140, 00142), and any other source -- 'manual', or whatever POST contacts was given -- a hand. In
 * came_from's words, once: History's row says who and "Added" how, About's Added row the day and how.
 */
function addedBy(added: Pick<NonNullable<PersonDetailDto["added"]>, "source" | "title">): { who: string; how: string } {
  if (added.source !== "calendar" && added.source !== "lead") return { who: "You", how: "by hand" };
  const from = PERSON_CAME_FROM_WORDS[added.source];
  return {
    who: added.source === "calendar" ? "Calendar" : "Leads",
    how: `from ${from.charAt(0).toLowerCase()}${from.slice(1)}${added.source === "calendar" && added.title ? ` (${added.title})` : ""}`,
  };
}

type StandingRow = Pick<
  PersonRowDto,
  "latest_state" | "latest_paused_until" | "latest_assignee_user_id" | "needs_human" | "open_escalation_reason"
>;

/** The latest thread's standing, from the one rule every surface reads (standing.ts). */
export function personStanding(r: StandingRow, nowMs: number): StandingVerdict {
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
      open_escalation: !!r.open_escalation_reason,
    },
    nowMs,
  );
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
  // A reply counting down to send waits on you too, as the Inbox counts it (standing.ts replyWaitsOnYou).
  if (v.standing === "needs_you" || replyWaitsOnYou({ queued: !!r.queued_reply_at }, nowMs)) return "needs_you";
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

export interface PersonConsent {
  state: "unknown" | "opted_in" | "opted_out";
  dnc: boolean;
  label: string;
  /** The answer in its control's words: "Yes", "Not asked" or "No". */
  answerLabel: "Yes" | "Not asked" | "No";
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
  missing:
    "Choose the message where they said it. If they wrote to you somewhere Chanlytics doesn't see, record a sign-up form and say where in the note.",
  /** The message named is not one this person sent this workspace. */
  notTheirs: "That isn't a message this person sent you. Choose one of theirs.",
  /** The message named has nothing written in it. */
  wordless: "That message has no words in it to show their answer. Choose the one where they said it.",
  /** A message named beside another way of answering. */
  notOwnMessage: "Only an answer in their own message names a message.",
  /** Their own message, for many people at once: one message cannot be every person's. */
  batch:
    "Their own message is recorded one person at a time, on their page, where you choose the message. For signed slips, choose Sign-up form.",
} as const;

/** Why an answer given this way cannot be recorded with this message -- or null when it can. */
export function ownMessageRefusal(
  source: string | null | undefined,
  messageId: string | null | undefined,
): string | null {
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
export function mayReceive(r: Pick<PersonRowVM, "consent" | "phone">, purpose: SendPurpose): boolean {
  return whyNotReceive(r, purpose) === null;
}

/**
 * Why a broadcast may not reach this person, or null when it may: the same one
 * rule as `mayReceive`, with its answer kept. A run that leaves someone out can
 * then say which of three things it was -- no number to send to, a stop (asked
 * to, or on the do-not-contact list), or never having said yes -- instead of
 * one count that hides the one an owner can do something about.
 */
export type NotReceived = "no_number" | "stopped" | "no_yes";

export function whyNotReceive(r: Pick<PersonRowVM, "consent" | "phone">, purpose: SendPurpose): NotReceived | null {
  // Every audience today leaves by WhatsApp or text, and both need a number. A
  // person with an address and none is reached when the email wire carries
  // reminders (docs/plans/2026-09-17-email-channel.md, §11), not before.
  if (!r.phone) return "no_number";
  const said = mayMessageFor(
    { consent: r.consent.state, dnc: r.consent.dnc, marketing_consent: r.consent.marketing },
    purpose,
    { proactive: true },
  );
  if (said.ok) return null;
  return said.reason === "opted_out" ? "stopped" : "no_yes";
}

/**
 * Whether this person's yes covers a message of this purpose, a number to send it to aside: the half of
 * `mayReceive` that is an answer they gave. When nobody on a list can be sent a thing and somebody on it said yes,
 * what is missing is a number, not an answer -- and asking them for their yes asks for one they already gave.
 */
export function saidYesTo(r: Pick<PersonRowVM, "consent">, purpose: SendPurpose): boolean {
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
  const askedCandidates = [ts(r.last_inbound_at), ts(r.last_inbound_call_at ?? null)].filter(
    (x): x is number => x !== null,
  );
  const askedMs = askedCandidates.length ? Math.max(...askedCandidates) : null;
  const booked = !!v?.next;
  const nextVisitMs = v?.next ? Date.parse(v.next.start) : null;
  const lastVisitMs = v?.last ? Date.parse(v.last.start) : null;
  const askedNotBooked = calendar === "ok" && askedMs !== null && nowMs - askedMs <= MONTH_MS && !v?.next && !v?.last;
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
              ? last.ts === null
                ? "no contact recorded"
                : `last contact ${ago(last.ts, tz, nowMs)}`
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
        hoursLeft: w.closesAtIso ? Math.max(0, Math.round((new Date(w.closesAtIso).getTime() - nowMs) / 3_600_000)) : 0,
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
    nextVisitDays: nextVisitMs !== null ? Math.max(0, Math.ceil((nextVisitMs - nowMs) / DAY_MS)) : null,
    lastVisitDays: lastVisitMs !== null ? Math.max(0, Math.floor((nowMs - lastVisitMs) / DAY_MS)) : null,
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
export const PEOPLE_LISTS: readonly {
  id: string;
  label: string;
  group: PeopleListGroup;
  needsCalendar?: boolean;
  /** Only where the profile lists a consult-first service. */
  needsConsultFirst?: boolean;
  /** Only where deals are on here: the workspace says some customers get a proposal first (dealsAreOn, 0008). */
  needsDeals?: boolean;
  /**
   * False for a list a person's page already says in its own words -- Right now says who needs you, the consent rows
   * say the two answers, the Deal section says the stage -- so their Lists section names only the lists it alone can.
   */
  onProfile?: false;
  test: (vm: PersonRowVM) => boolean;
}[] = [
  { id: "needs_you", label: "Needs you", group: "attention", onProfile: false, test: (v) => v.state === "needs_you" },
  {
    id: "waiting_on_you",
    label: "Waiting on you",
    group: "attention",
    onProfile: false,
    test: (v) => v.state === "waiting_on_you",
  },
  // Their next step's day has come (0007, amended): every workspace, deals or not. The page says the step itself.
  {
    id: "steps_due",
    label: "Steps due",
    group: "attention",
    onProfile: false,
    test: (v) => !!v.nextStep && v.nextStep.due !== "ahead",
  },
  { id: "new_week", label: "New this week", group: "journey", test: (v) => v.state === "new" },
  {
    id: "booked_week",
    label: "Booked this week",
    group: "journey",
    needsCalendar: true,
    test: (v) => v.nextVisitDays !== null && v.nextVisitDays <= 7,
  },
  { id: "booked", label: "Booked", group: "journey", needsCalendar: true, test: (v) => v.booked },
  {
    id: "asked_never_booked",
    label: "Asked, never booked",
    group: "journey",
    needsCalendar: true,
    test: (v) => v.askedNotBooked,
  },
  // Forty-five days since the chair, nothing ahead: the win-back list, from visits rather than silence.
  {
    id: "lapsed",
    label: "Lapsed",
    group: "journey",
    needsCalendar: true,
    test: (v) => !v.booked && v.lastVisitDays !== null && v.lastVisitDays >= 45,
  },
  // The journey past the booking (0004). Each exists only where deals are on here (0008).
  {
    id: "consultation_booked",
    label: "Consultation booked",
    group: "journey",
    needsCalendar: true,
    needsConsultFirst: true,
    needsDeals: true,
    onProfile: false,
    test: (v) => v.consultationVisit && !v.deal,
  },
  {
    id: "proposal_out",
    label: "Proposal out",
    group: "journey",
    needsDeals: true,
    onProfile: false,
    test: (v) => v.deal?.stage === "proposed",
  },
  {
    id: "clients",
    label: "Clients",
    group: "journey",
    needsDeals: true,
    onProfile: false,
    test: (v) => v.deal?.stage === "won",
  },
  {
    id: "deal_ended",
    label: "Ended",
    group: "journey",
    needsDeals: true,
    onProfile: false,
    test: (v) => v.deal?.stage === "ended",
  },
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
  {
    id: "opted_in",
    label: "Said yes to messages",
    group: "reach",
    onProfile: false,
    test: (v) => v.consent.state === "opted_in",
  },
  // The promotional audience, on its own column. The only people a MARKETING
  // broadcast may reach.
  // CAN receive, so it is the broadcast's own rule -- a yes to offers AND a number --
  // not the bare answer, which was the difference between this list and what the
  // route would actually enrol.
  {
    id: "offers_ok",
    label: "Can receive offers",
    group: "reach",
    onProfile: false,
    test: (v) => mayReceive(v, "marketing"),
  },
  {
    id: "opted_out",
    label: "Opted out",
    group: "reach",
    onProfile: false,
    test: (v) => v.consent.state === "opted_out",
  },
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

/** A list's broadcast, where the list is an audience of its own: a list kept by hand, and New this week once answered. */
const USE_IN_A_BROADCAST = "Use in a broadcast";

// Broadcasts has no audience for this list: its people are exactly who a broadcast reaches, so the composer opens on
// Everyone, and the button says who that reaches. It said "New broadcast" here and "Use in a broadcast" on Lists,
// and opened an audience with another name.
const OFFERS_STEP = { cta: "Broadcast to everyone who said yes", to: "broadcasts", broadcast: true };

/**
 * `answered`: what a step that is a door to the yes to offers becomes once everyone on the list has given it. Asking
 * again would ask for an answer they gave (#663's rule), so the step is the list's broadcast instead.
 */
const LIST_STEPS: Record<
  string,
  { cta: string; to: string; broadcast?: boolean; text?: string; answered?: { cta: string; to: string } }
> = {
  needs_you: { cta: "Open the Inbox", to: "inbox", text: "Each of them is waiting for a person." },
  waiting_on_you: { cta: "Open the Inbox", to: "inbox", text: "You own these threads, and they wrote last." },
  new_week: {
    cta: "Get their yes",
    to: GET_YES_ROUTE,
    text: "Their yes to offers is the phrase and the QR on Broadcasts.",
    answered: { cta: USE_IN_A_BROADCAST, to: "broadcasts/new_week" },
  },
  booked_week: { cta: "See the week", to: "calendar", text: "Their appointments are on the Calendar." },
  asked_never_booked: { cta: "Text the booking link", to: "broadcasts/asked_never_booked", broadcast: true },
  // "Bring them back", never "Win them back": Win-back is the playbook for the quiet (quiet_30), and this list has its
  // own, named Lapsed.
  lapsed: { cta: "Bring them back", to: "broadcasts/lapsed", broadcast: true },
  // The journey past the booking (0004). Clients has no step: an engagement running is not something to push.
  consultation_booked: { cta: "See the week", to: "calendar", text: "Their consultations are on the Calendar." },
  proposal_out: {
    cta: "Open the Inbox",
    to: "inbox",
    text: "A word from you is the next step; nothing sends on its own.",
  },
  deal_ended: { cta: "Win them back", to: "broadcasts/deal_ended", broadcast: true },
  quiet: { cta: "Reach out", to: "broadcasts/quiet", broadcast: true },
  // The broadcast step belongs to the OFFERS list, not to this one: a person on
  // this list has said yes to hearing from the business, which is not a yes to a
  // promotion. Sending them here with "New broadcast" is what made the empty
  // audience feel like a bug in the composer rather than a missing answer.
  opted_in: {
    cta: "Get their yes to offers",
    to: GET_YES_ROUTE,
    text: "They answer and hear about their own visits. Offers need a second, separate yes.",
    answered: OFFERS_STEP,
  },
  offers_ok: OFFERS_STEP,
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
  if (step.answered && members.length > 0 && members.every((m) => saidYesTo(m, "marketing")))
    return broadcastStep(step.answered.cta, step.answered.to, members);
  if (!step.broadcast) return { text: step.text ?? "", cta: step.cta, to: step.to, enabled: members.length > 0 };
  return broadcastStep(step.cta, step.to, members);
}

/**
 * A list kept by hand has one onward step: a broadcast to the people on it who said yes to offers. The same
 * sentence and the same rule as a smart list's broadcast step, so the two kinds of list read alike on People,
 * which is where both live now (the Lists page folded into it).
 */
export function savedListAction(id: string, members: PersonRowVM[]): PeopleListAction {
  return broadcastStep(USE_IN_A_BROADCAST, `broadcasts/${id}`, members);
}

/**
 * Why nobody can be sent a thing when somebody said the yes it needs: what a broadcast reaches. The reason in
 * `noNumberWords`, and the arithmetic under Today's reach row (today.ts todayLeaks), in one spelling.
 */
export const NO_NUMBER_REACH = "a broadcast reaches only a recorded yes with a number to send to";

/**
 * Nobody on a list can be sent this, and somebody on it said yes: what is missing is a number to send it to. People's
 * list step says it of a list (#663) and the send screen of the audience it has open -- `who` is "this list" or the
 * audience's name -- so the two say it in one spelling.
 */
export function noNumberWords(who: string, purpose: SendPurpose): string {
  return `Nobody on ${who} can be sent ${purpose === "marketing" ? "an offer" : "a message"} yet — ${NO_NUMBER_REACH}.`;
}

/**
 * How many on an audience said yes to what a message needs, as the send screen's line under the audience says it.
 * The number is who it reaches (`sending`: a yes and a number), in the shorthand People's list step uses ("N of M on
 * this list said yes to offers — a broadcast reaches them") -- except when that is 0 and somebody DID say yes
 * (`saidYes`, audiencePreview's): "0 people … said yes" stood over `noNumberWords` and was false, so it says how many
 * did, and what they are missing.
 */
export function saidYesWords(who: string, purpose: SendPurpose, sending: number, saidYes: number): string {
  const noNumber = sending === 0 && saidYes > 0;
  const n = noNumber ? saidYes : sending;
  const words = `${n} ${n === 1 ? "person" : "people"} on ${who} said yes to ${purpose === "marketing" ? "offers" : "messages"}`;
  return noNumber ? `${words}, ${n === 1 ? "with no number" : "none with a number"} to send to` : words;
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
    const saidYes = members.some((m) => saidYesTo(m, "marketing"));
    if (members.length && !saidYes) {
      return {
        text: "Nobody on this list has said yes to offers yet — a broadcast reaches only that answer.",
        cta: "Get their yes",
        to: GET_YES_ROUTE,
        enabled: true,
      };
    }
    return {
      text: members.length ? noNumberWords("this list", "marketing") : "Nobody here right now.",
      cta,
      to,
      enabled: false,
    };
  }
  return {
    text: `${offersYes} of ${members.length} on this list said yes to offers — a broadcast reaches them.`,
    cta,
    to,
    enabled: true,
  };
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
  return {
    total: rows.length,
    needsYou,
    needsYouOldestMs: oldest,
    newThisMonth,
    reachedWeek,
    reachedWeekNew,
    booked,
    askedNotBooked,
  };
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
  if (p.quote) {
    sentence = oneLine(p.quote, 160);
    quoted = true;
  } else if (p.callSummary) sentence = oneLine(tidyCallSummary(p.callSummary) ?? p.callSummary, 160);
  // A proposal waiting says more than a visit ahead (0004): the row's brief, "Proposal out · 6 d". A client's row
  // keeps the visit, which is the next thing about them; a pass or an end says nothing here.
  else if (p.deal && p.deal.stage === "proposed" && p.deal.brief) sentence = p.deal.brief;
  else if (p.nextVisit) sentence = `Booked · ${p.nextVisit}`;
  else if (p.lastVisit) sentence = `Last visit · ${p.lastVisit}`;
  else if (p.calls > 0)
    sentence =
      p.calls === 1 ? "Phoned once; nothing in writing yet" : `Phoned ${p.calls} times; nothing in writing yet`;
  else sentence = "Nothing written yet";
  const r = p.receptionist;
  let status: string[];
  if (p.state === "waiting_on_you") status = ["You own the thread", "they wrote last"];
  else if (r.tone === "answering")
    status = p.hasChat ? ["Receptionist", "answering on WhatsApp"] : ["Receptionist", "takes their calls"];
  else status = r.label.split(", ");
  if (p.state === "needs_you" && p.needsYouSinceMs !== null)
    status = [...status, `since ${clock(p.needsYouSinceMs, tz, nowMs)}`];
  const cta: AttentionRowVM["cta"] = !p.threadId
    ? null
    : p.state === "needs_you" || p.state === "waiting_on_you"
      ? { label: "Open in Inbox", kind: "primary", to: `inbox/${p.threadId}` }
      : { label: "Open thread", kind: "ghost", to: `inbox/${p.threadId}` };
  return { channel, when, sentence, quoted, status, tone: r.tone, cta };
}

/* -------------------------------- profile -------------------------------- */

export type TimelineKind =
  "customer" | "receptionist" | "you" | "system" | "call" | "escalation" | "decision" | "visit" | "consent" | "deal";

/**
 * How a profile's timeline narrows: everything, or one kind of record. "Messages" is the thread itself --
 * what was said, and the escalations and decisions in it; only "All" keeps the system lines.
 */
export type TimelineFilterId = "all" | "messages" | "calls" | "visits" | "consent" | "deals";
export const TIMELINE_FILTERS: readonly {
  id: TimelineFilterId;
  label: string;
  kinds: readonly TimelineKind[] | null;
}[] = [
  { id: "all", label: "All", kinds: null },
  { id: "messages", label: "Messages", kinds: ["customer", "receptionist", "you", "escalation", "decision"] },
  { id: "calls", label: "Calls", kinds: ["call"] },
  { id: "visits", label: "Visits", kinds: ["visit"] },
  { id: "consent", label: "Consent", kinds: ["consent"] },
  { id: "deals", label: "Deals", kinds: ["deal"] },
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
    c.consent === "opted_in"
      ? offers
        ? "Said yes to offers and news"
        : "Said yes to messages about their visit"
      : c.consent === "opted_out"
        ? offers
          ? "Said no to offers"
          : "Said stop — nothing goes out to them"
        : offers
          ? "Offers: back to not asked"
          : "Back to not asked";
  let sub: string | undefined;
  if (c.source === "customer_message") {
    const where =
      c.channel === "sms"
        ? "by text"
        : c.channel === "whatsapp"
          ? "on WhatsApp"
          : c.channel === "email"
            ? "by email"
            : "in their own message";
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
  /** A visit that has not ended yet: the page says it under Coming up (comingUp), not in what has happened. */
  ahead?: boolean;
}

/**
 * A visit that has not ended, as the page's Coming up draws it: a small leaf with the month and the day of the month,
 * what it is, and when. `day` is "Today", "Tomorrow" or the weekday, by the business's clock.
 */
export interface PersonVisitAheadVM {
  id: string;
  month: string;
  date: string;
  day: string;
  title: string;
  time: string;
  /** Matched to them by their name alone, which the page says, as the Next visit fact does. */
  byName: boolean;
  to: string;
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
  /** Their visits that have not ended, soonest first: the page's Coming up. Each is in `timeline` too, marked `ahead`. */
  comingUp: PersonVisitAheadVM[];
  about: { k: string; v: string }[];
  /** Their notes (0007): the receptionist's suggestions first, then newest first. */
  noteList: PersonNoteVM[];
  /** The team a note can be for; empty where the team could not be read. */
  noteTeam: PersonNoteTeamDto[];
  /** The workspace's booking link, or null when none is on file. */
  bookingLink: string | null;
  /**
   * Their proposal (proposalLinkOf, 0008): the link on their deal while it is a proposal out; for any other deal, none;
   * with no deal at all, the one on the person (00154) while it is still read. Null where deals are off, and when none
   * is on file.
   */
  proposal: PersonProposalVM | null;
  /** The send-the-proposal button's words for the wire a reply goes out on (proposalAction); `ready` false hides it. */
  proposalAction: { label: string; title: string; ready: boolean };
  /** Their deals, newest first, as the page says them (0004). */
  deals: DealVM[];
  /** Whether deals are on here (dealsAreOn): the page draws its Deal section, and offers the proposal's send, only then. */
  dealsOn: boolean;
  /** The profile's service names; the picker appears only past one. */
  services: string[];
  /** The services that need a consultation first: a proposal started from one names it (deal-sheet.ts). */
  consultFirst: string[];
  /** "inbox/th-…" or null for a phone-only person. */
  openThread: string | null;
  /** The person's own setting (null = following the workspace) and the
   *  workspace's mode, so the rail can say which is in force. 'veto' at the
   *  workspace level still answers, after a hold, so it reads as "Answer". */
  receptionistMode: { person: PersonMode | null; workspace: PersonMode | null };
  /** What they have written to you, newest first: the messages an answer "in their own message" may name (00137). */
  ownMessages: OwnMessageVM[];
  /**
   * The People lists that keep themselves current and have them on today, by the rail's own tests (PEOPLE_LISTS): the
   * ones this page does not already say another way, and a calendar's only with a calendar.
   */
  smartLists: { id: string; label: string }[];
  /** The runs that named them, newest first, each with what became of it. */
  campaigns: PersonCampaignVM[];
  /** The lead they were found as, with the door to it on Leads; null when they were never one. */
  lead: { id: string; name: string; found: string; to: string } | null;
  /** What the page's More menu offers for them, in order (personActs): the page keeps those its reader's role allows. */
  acts: PersonActVM[];
}

/**
 * One act in a person's More menu: a few words, the line said on hover where the act needs explaining, the group it
 * sits in (a send, a way to reach them, the delete: a line between groups), and who may press it ("any" reader, one
 * who may "record", or the "owner"). The page draws them; which exist, and their words, are here.
 */
export interface PersonActVM {
  id: "booking" | "proposal" | "call" | "copy-phone" | "copy-email" | "delete";
  label: string;
  hint: string | null;
  group: "send" | "reach" | "delete";
  needs: "any" | "record" | "owner";
  danger?: boolean;
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

/**
 * What can be done for a person from their page, besides opening their thread (the page's one primary act).
 *
 * A send opens their thread with the words ready; nothing is sent from the page. So it says so, in the wire it goes
 * on, and never names a template or a window: where WhatsApp takes only an approved message the thread offers it,
 * which is what its hover says. The labels are a few words each: with a sentence beside every one the menu was a
 * block of wrapped words cut off at its edge. No send reaches someone who said stop or is on do-not-contact, and no call reaches
 * someone on do-not-contact. A call is the member's own phone ringing them (a tel: link), never the receptionist.
 */
export function personActs(p: Omit<PersonVM, "acts">): PersonActVM[] {
  const acts: PersonActVM[] = [];
  const reach = mayReach(p);
  const on =
    p.replyVia === "Email" ? " by email" : p.replyVia === "Text" ? " as a text" : p.replyVia ? " on WhatsApp" : "";
  const ready = `Opens their thread with it ready to send${on}`;
  if (reach && p.bookingLink)
    acts.push({
      id: "booking",
      label: "Send booking link",
      hint: p.bookingLinkAction.ready
        ? ready
        : "Only an approved message reaches them until they write again; their thread offers the one with the link",
      group: "send",
      needs: "record",
    });
  // A proposal is a deal's (0008): a workspace whose customers book is never offered one to send. Its first send is
  // the deal card's next act (deal-sheet.ts dealNextAct), and no send is offered while one is on its way, so the menu
  // offers only a send the card does not: the link again once it went, or a link left on someone with no deal.
  const cardSends = p.deal?.stage === "proposed" && (!p.proposal?.sent || !!p.deal.proposal?.sending);
  if (reach && p.dealsOn && p.proposal && p.proposalAction.ready && !cardSends)
    acts.push({
      id: "proposal",
      label: p.proposal.sent ? `${DEAL_ACT_WORDS.send} again` : DEAL_ACT_WORDS.send,
      hint: ready,
      group: "send",
      needs: "record",
    });
  if (p.phone && !p.consent.dnc) {
    acts.push({ id: "call", label: "Call", hint: "From your own phone", group: "reach", needs: "any" });
    acts.push({ id: "copy-phone", label: "Copy number", hint: null, group: "reach", needs: "any" });
  }
  if (p.email) acts.push({ id: "copy-email", label: "Copy email", hint: null, group: "reach", needs: "any" });
  acts.push({ id: "delete", label: "Delete person…", hint: null, group: "delete", needs: "owner", danger: true });
  return acts;
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
      if (m.direction !== "inbound" || m.sender !== "customer" || m.channel === "voice" || m.channel === "system")
        continue;
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
  return found
    .sort((a, b) => b.t - a.t)
    .slice(0, OWN_MESSAGE_CHOICES)
    .map((f) => f.vm);
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
    call_seconds: d.calls.length
      ? Math.round(
          d.calls.filter((k) => k.status !== "not_connected").reduce((a, k) => a + (k.duration_ms ?? 0), 0) / 1000,
        )
      : d.row.call_seconds,
    escalation_count: d.escalations.length || d.row.escalation_count,
    visits: d.visits ?? d.row.visits ?? null,
  };
  const base = toPersonRowVM(row, tz, now);
  // Whether deals are on here (dealsAreOn, 0008): where they are off, nothing on the page says a deal -- no fact, no
  // timeline line, no proposal -- whatever the database holds.
  const dealsOn = !!d.deals_on;
  // Their deals as the page lists them (0004): each row through the one view model the People row uses, and each
  // proposal's link with whether it went (0008), read from the thread's own messages as the person's proposal is: the
  // deal card says it for every proposal out, not only the one the page's head acts on.
  const deals = dealsOn
    ? (d.deals ?? [])
        .map((x) => toDealVM(x, tz, nowMs))
        .filter((x): x is DealVM => !!x)
        .map((x) => {
          if (!x.proposal) return x;
          const url = x.proposal.url;
          const sent = proposalSent(d.conversations, url);
          return { ...x, proposal: { ...x.proposal, sent, sending: proposalSending(d.conversations, url) } };
        })
    : [];
  // The row's columns say WHICH deal shows (people_list's lateral join, pickCurrentDeal's rule); the listed copy of it
  // carries the version a move is checked against, which the columns do not.
  const current = dealsOn ? (deals.find((x) => x.id === base.deal?.id) ?? base.deal) : null;
  // A person we know only by number or address has no first name to shorten
  // to: "+1" as a speaker label is nobody. Keep the whole identifier.
  const first = isIdentifierName(base.name) ? base.name : base.name.split(" ")[0] || base.name;
  const stamp = (t: number) => ({ time: clockTime(t, tz), day: clockDayLabel(t, tz, nowMs) });
  const items: PersonTimelineItemVM[] = [];
  const convIds = new Set(d.conversations.map((c) => c.id));
  const runOf = new Map((d.campaigns ?? []).filter((c) => c.message_id).map((c) => [c.message_id!, c]));

  for (const c of d.conversations) {
    for (const m of c.messages) {
      if (m.type === "call_summary") continue; // the call carries its own item
      if (m.status === "canceled") continue; // never reached them
      const t = ts(messageAt(m));
      if (t === null) continue;
      const kind: TimelineKind =
        m.sender === "customer"
          ? "customer"
          : m.sender === "human"
            ? "you"
            : m.sender === "ai"
              ? "receptionist"
              : "system";
      // Who sent it, in the words the Inbox uses (messageAuthor): a person's reply is the team's, since the row does
      // not say which member sent it, and a run's message is its playbook's or its broadcast's. Every one of ours read
      // "You", a playbook's run among them.
      // A message a run sent is the run's, by its meta or by the recipient row that names it (broadcast_recipients
      // message_id): a run's row is the ledger of what it sent, whatever the message kept.
      const run = runOf.get(m.id);
      const author = messageAuthor(
        run && m.meta?.source !== "broadcast"
          ? {
              ...m,
              meta: {
                ...m.meta,
                source: "broadcast",
                broadcast_name: run.name,
                ...(run.playbook_id ? { playbook_name: run.playbook_name || run.name } : {}),
              },
            }
          : m,
      );
      const who =
        kind === "customer"
          ? first
          : !author
            ? "System"
            : author.kind === "receptionist"
              ? "Receptionist"
              : author.kind === "team"
                ? "Your team"
                : capitalize(author.words);
      const sub = m.status === "failed" ? "Not delivered" : m.status === "queued" ? "Sending" : undefined;
      items.push({
        id: `m-${m.id}`,
        ts: t,
        ...stamp(t),
        kind,
        who,
        text: messageWords(m),
        ...(sub ? { sub } : {}),
        link: { label: "Open the thread", to: `inbox/th-${c.id}` },
      });
    }
  }

  for (const k of d.calls) {
    const t = ts(k.started_at);
    if (t === null) continue;
    const dur = mmss(k.duration_ms);
    const wanted = (k.wanted || "").trim();
    const summary = tidyCallSummary(k.summary) ?? "";
    const missed = k.status === "not_connected";
    const sentence = missed
      ? "The call never connected."
      : wanted ||
        (summary
          ? (summary.split(/(?<=[.!?])\s/)[0] ?? summary)
          : k.in_voicemail
            ? "Reached voicemail."
            : "No summary from this call.");
    items.push({
      id: `k-${k.id}`,
      ts: t,
      ...stamp(t),
      kind: "call",
      who: missed
        ? "Missed call"
        : `${k.direction === "inbound" ? "Inbound" : "Outbound"} call${dur ? ` · ${dur}` : ""}`,
      text: sentence,
      sub: missed
        ? "Never connected"
        : k.recording?.fetch_state === "stored"
          ? "Recording and transcript in Conversations"
          : "Transcript in Conversations",
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
    const mine =
      (dec.subject_type === "conversation" && convIds.has(dec.subject_id)) ||
      (dec.subject_type === "contact" && dec.subject_id === row.id);
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
    items.push({
      id: `c-${c.id}`,
      ts: t,
      ...stamp(t),
      kind: "consent",
      who: w.who,
      text: w.text,
      ...(w.sub ? { sub: w.sub } : {}),
    });
  }

  // Their visits, from the calendar: what happened in the chair belongs on
  // the same line as what was said. A visit ahead reads as booked.
  const comingUp: { t: number; vm: PersonVisitAheadVM }[] = [];
  if (d.visits?.all?.length) {
    const tz = d.visits.timezone;
    for (const v of d.visits.all) {
      const t = Date.parse(v.start);
      if (!Number.isFinite(t)) continue;
      const ahead = Date.parse(v.end) >= nowMs;
      if (ahead) {
        const on = visitDay(t, tz, nowMs);
        comingUp.push({
          t,
          vm: {
            id: `v-${v.id}`,
            month: new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short" }).format(new Date(t)),
            date: new Intl.DateTimeFormat("en-US", { timeZone: tz, day: "numeric" }).format(new Date(t)),
            day:
              on === "Today" || on === "Tomorrow"
                ? on
                : new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(t)),
            title: visitTitleFor(v.title, base.name),
            time: visitTime(v, tz),
            byName: v.via === "name",
            to: `calendar/${visitDateKey(v.start, tz)}`,
          },
        });
      }
      items.push({
        ...(ahead ? { ahead: true } : {}),
        id: `v-${v.id}`,
        ts: t,
        ...stamp(t),
        kind: "visit",
        who: "Calendar",
        text: `${ahead ? "Booked" : "Visited"} · ${visitTitleFor(v.title, base.name)}`,
        sub: `${visitTime(v, tz)} · from ${d.visits.source}${v.via === "name" ? " · matched by name" : ""}`,
        link: { label: "Open the day", to: `calendar/${visitDateKey(v.start, tz)}` },
      });
    }
  }
  // Each move of a deal, on the same line as what was said: what a person recorded, when (0004). The amount is the
  // proposal's value until they say yes, and then the client's, so it is said on the line it belongs to (0008); a pass
  // says why.
  for (const x of dealsOn ? (d.deals ?? []) : []) {
    const svc = x.service ? ` · ${x.service}` : "";
    const put = (id: string, at: string | null, text: string) => {
      const t = ts(at);
      if (t === null) return;
      items.push({ id, ts: t, ...stamp(t), kind: "deal", who: "You", text });
    };
    const value = amountWords(x.amount_cents, x.per, x.currency);
    const client = x.stage === "won" || x.stage === "ended";
    put(`dl-${x.id}-p`, x.proposed_at, `${DEAL_STAGE_WORDS.proposed}${svc}${value && !client ? ` · ${value}` : ""}`);
    if (client) put(`dl-${x.id}-w`, x.decided_at, `Became a client${svc}${value ? ` · ${value}` : ""}`);
    const why = isDealLostReason(x.lost_reason) ? ` · ${DEAL_LOST_REASON_WORDS[x.lost_reason]}` : "";
    if (x.stage === "lost") put(`dl-${x.id}-l`, x.decided_at, `Passed${svc}${why}`);
    if (x.stage === "ended") put(`dl-${x.id}-e`, x.ended_at, `Ended${svc}`);
  }
  if (d.added) {
    const t = ts(d.added.at);
    const by = addedBy(d.added);
    if (t !== null)
      items.push({ id: "added", ts: t, ...stamp(t), kind: "system", who: by.who, text: `Added ${by.how}` });
  }

  items.sort((a, b) => b.ts - a.ts);

  // Last exchange: the customer's last line and the last reply, verbatim.
  const latestConv = [...d.conversations].sort(
    (a, b) => (ts(b.last_message_at) ?? 0) - (ts(a.last_message_at) ?? 0),
  )[0];
  let customer: PersonVM["lastExchange"]["customer"] = null;
  let reply: PersonVM["lastExchange"]["reply"] = null;
  if (latestConv) {
    for (let i = latestConv.messages.length - 1; i >= 0; i--) {
      const m: MessageDto = latestConv.messages[i];
      if (m.type === "call_summary") continue;
      const t = ts(messageAt(m));
      if (t === null) continue;
      if (!customer && m.direction === "inbound" && m.body)
        customer = { text: m.body, at: `${stamp(t).time} ${stamp(t).day}` };
      if (
        !reply &&
        m.direction === "outbound" &&
        m.status !== "canceled" &&
        (m.sender === "ai" || m.sender === "human")
      ) {
        reply = {
          text: messageText(m),
          at: `${stamp(t).time} ${stamp(t).day}`,
          who: m.sender === "ai" ? "Receptionist" : "You",
        };
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
    rightNow = {
      tone: "paused",
      title: "Paused, a person owns this thread",
      detail: "A person owns this thread; automatic replies resume when it is handed back.",
      cta: openThread,
    };
  } else if (r.open_escalation_reason) {
    const since = r.open_escalation_since ? shortTime(r.open_escalation_since, tz, now) : null;
    rightNow = {
      tone: "escalated",
      title: `Escalated · ${reasonShort(r.open_escalation_reason)}`,
      detail: `${capitalize(reasonShort(r.open_escalation_reason))}${since ? ` · since ${since}` : ""}. Paused until someone answers.`,
      cta: openThread,
    };
  } else if (r.needs_human) {
    rightNow = {
      tone: "escalated",
      title: "Waiting for a person",
      detail: "Stopped, and nobody has taken the thread yet.",
      cta: openThread,
    };
  } else if (r.queued_reply_at) {
    const q = ts(r.queued_reply_at);
    rightNow = {
      tone: "queued",
      title: "Reply sending",
      detail: `A reply is queued${q !== null ? `, ${ago(q, tz, nowMs)}` : ""} — it can still be stopped from the Inbox.`,
      cta: openThread,
    };
  } else if (base.receptionist.tone === "snoozed") {
    rightNow = {
      tone: "snoozed",
      title: "Snoozed",
      detail: `Wakes ${shortTime(r.latest_snooze_until ?? null, tz, now)}.`,
      cta: openThread,
    };
  } else if (base.consent.state === "opted_out") {
    // The consent ask on the rail carries the date and the words; here, only what it means for the thread.
    rightNow = {
      tone: "silent",
      title: "Silent, they opted out",
      detail: "They said stop — nothing goes out to them until they ask again.",
      cta: null,
    };
  } else if (
    ["never", "ask"].includes(d.receptionist_mode ?? "") ||
    ["never", "ask"].includes(d.workspace_reply_mode ?? "")
  ) {
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
    rightNow = {
      tone: "answering",
      title: "Answering",
      detail: "New messages are answered automatically.",
      cta: base.threadId ? { label: "Open the thread", to: `inbox/${base.threadId}` } : null,
    };
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
  const via =
    replyChannelOfThreads(d.conversations) ?? (base.replyVia === "Email" ? "email" : base.replyVia ? "whatsapp" : null);
  const exactWindow = via ? replyWindow(via, r.latest_wa_inbound_at, now) : null;
  const lc = base.lastContact;
  const lastMeta =
    lc.who === "they"
      ? lc.kind === "call"
        ? "they phoned"
        : "they wrote"
      : lc.who === "you"
        ? "you replied"
        : lc.who === "receptionist"
          ? "receptionist replied"
          : lc.who === "system"
            ? "we sent"
            : "";
  // "Held for you" is the word the People row puts beside the state, for a thread a person owns or a mode that holds.
  const toneWord: Record<ReceptionistTone, string> = {
    answering: "Answering",
    escalated: "Waiting",
    queued: "Queued",
    snoozed: "Snoozed",
    paused: "Held for you",
    silent: "Silent",
  };
  // Under the word, what the label says after it ("set to Never", "a person owns the thread"), not the label again.
  const receptionistMeta = (label: string) =>
    label.includes(", ") ? label.slice(label.indexOf(", ") + 2) : label.toLowerCase();
  const facts: PersonFact[] = [
    { label: "First contact", value: base.firstContact.label, meta: firstChannel },
    { label: "Last contact", value: lc.ts !== null ? ago(lc.ts, tz, nowMs) : "—", meta: lastMeta },
    {
      label: "Conversations",
      value: base.threads,
      meta: base.escalations ? `${base.escalations} needed you` : "none needed you",
    },
    {
      label: "Calls",
      value: base.calls,
      meta: base.calls ? `${Math.max(1, Math.round(base.callSeconds / 60))} min total` : "no calls",
    },
    // Consent is the two asks on the rail, each with how it was given. A fact, an About row and a pill said it
    // again, five times on one profile.
    {
      label: "Receptionist",
      value: toneWord[base.receptionist.tone],
      meta: base.receptionist.tone === "escalated" ? "for you" : receptionistMeta(base.receptionist.label),
    },
    // The deal they are deciding on or took (0004): the stage word, and its line with the service and the amount.
    ...(current ? [{ label: "Deal", value: current.word, meta: current.line, tone: "" as const }] : []),
  ];

  // Their proposal (proposalLinkOf, 0008): the link on the deal they are deciding on while it is a proposal out, none
  // for any other deal, the person's own only with no deal at all; nothing where deals are off. Its host for the row,
  // and whether it went out.
  const proposalUrl = dealsOn ? proposalLinkOf(current, d.proposal_url) : null;
  const proposal: PersonProposalVM | null = proposalUrl
    ? { url: proposalUrl, host: linkHost(proposalUrl), sent: proposalSent(d.conversations, proposalUrl) }
    : null;
  const sentAt = proposal?.sent ? ts(proposal.sent.at) : null;
  const sentWords =
    proposal?.sent && sentAt !== null
      ? `${clockDateYear(sentAt, tz)}${proposal.sent.via ? ` · ${proposal.sent.via}` : ""}`
      : null;

  // About rail.
  const about: { k: string; v: string }[] = [];
  if (base.phone) about.push({ k: "Phone", v: base.phone });
  if (base.email) about.push({ k: "Email", v: base.email });
  if (proposal) about.push({ k: "Proposal", v: proposal.host });
  if (base.waName) about.push({ k: "WhatsApp name", v: base.waName });
  about.push({
    k: "First contact",
    v:
      base.firstContact.ts !== null
        ? `${base.firstContact.estimate ? "Before " : ""}${clockDateYear(base.firstContact.ts, tz)} · ${firstChannel}`
        : "—",
  });
  about.push({ k: "Channels", v: base.channels.map((c) => PERSON_CHANNEL_WORDS[c]).join(" · ") || "—" });
  if (base.hasChat && via && exactWindow) {
    const hours = exactWindow.closesAtIso
      ? Math.max(0, Math.round((new Date(exactWindow.closesAtIso).getTime() - nowMs) / 3_600_000))
      : 0;
    const v = repliesWords(REPLY_VIA[via], { open: exactWindow.open, hoursLeft: hours });
    if (v) about.push({ k: "Replies", v });
  }

  // Their appointments, when the workspace's calendar is connected: the next
  // one is the fact an owner asks for first, and the one the receptionist
  // is given when they call.
  if (d.visits) {
    const v = d.visits;
    const nextLine = v.next
      ? `${visitLine(v.next, v.timezone, nowMs)} · ${visitTitleFor(v.next.title, base.name)}`
      : v.state === "ok"
        ? "Nothing on the calendar"
        : "Calendar could not be read";
    facts.push({
      label: "Next visit",
      value: v.next ? visitDay(v.next.start, v.timezone, nowMs) : "—",
      // The cell is narrow: the time here, the service in About.
      meta: v.next
        ? `${visitTime(v.next, v.timezone)}${v.next.via === "name" ? " · by name" : ""}`
        : v.state === "ok"
          ? "none booked"
          : "could not be read",
    });
    about.push({ k: "Next visit", v: nextLine });
    if (v.last)
      about.push({
        k: "Last visit",
        v: `${visitLine(v.last, v.timezone, nowMs)} · ${visitTitleFor(v.last.title, base.name)}`,
      });
  }
  if (d.added) {
    const at = ts(d.added.at);
    about.push({
      k: "Added",
      v: `${at !== null ? clockDateYear(at, tz) : "—"} · ${addedBy(d.added).how}`,
    });
  } else if (d.lead) {
    // Found as a lead, with no row saying when they were added: the lead's own day says it.
    const found = ts(d.lead.found_at);
    about.push({
      k: "Added",
      v: `${found !== null ? clockDateYear(found, tz) : "—"} · ${addedBy({ source: "lead", title: null }).how}`,
    });
  }

  const vm: Omit<PersonVM, "proposal" | "proposalAction" | "acts"> = {
    ...base,
    ...(via && exactWindow
      ? (() => {
          const win = {
            open: exactWindow.open,
            hoursLeft: exactWindow.closesAtIso
              ? Math.max(0, Math.round((new Date(exactWindow.closesAtIso).getTime() - nowMs) / 3_600_000))
              : 0,
          };
          return {
            replyVia: REPLY_VIA[via],
            replyWindow: win,
            bookingLinkAction: bookingLinkAction(REPLY_VIA[via], win),
          };
        })()
      : {}),
    since:
      base.firstContact.label === "—"
        ? ""
        : base.firstContact.estimate
          ? `Since ${base.firstContact.label.charAt(0).toLowerCase()}${base.firstContact.label.slice(1)}`
          : `Since ${base.firstContact.label}`,
    metaLine: `${plural(base.threads, "conversation")} · ${plural(base.calls, "call")}`,
    lastExchange: { customer, reply },
    facts,
    rightNow,
    timeline: items,
    comingUp: comingUp.sort((a, b) => a.t - b.t).map((c) => c.vm),
    about,
    noteList: personNotesVM(d.person_notes, tz, nowMs),
    noteTeam: d.note_team ?? [],
    bookingLink: d.booking_link?.trim() || null,
    openThread: base.threadId ? `inbox/${base.threadId}` : null,
    receptionistMode: {
      person: asPersonMode(d.receptionist_mode),
      workspace: d.workspace_reply_mode === "veto" ? "auto" : asPersonMode(d.workspace_reply_mode),
    },
    ownMessages: ownMessagesOf(d, stamp),
    smartLists: PEOPLE_LISTS.filter(
      (l) => l.onProfile !== false && (!l.needsCalendar || d.visits?.state === "ok") && l.test(base),
    ).map((l) => ({ id: l.id, label: l.label })),
    campaigns: campaignsOf(d, tz, nowMs),
    lead: d.lead
      ? {
          id: d.lead.id,
          name: d.lead.business_name || base.name,
          found: ts(d.lead.found_at) !== null ? clockDate(ts(d.lead.found_at)!, tz, nowMs) : "—",
          to: leadsRoute({ peek: d.lead.id }),
        }
      : null,
    deal: current,
    deals,
    dealsOn,
    services: d.services ?? [],
    consultFirst: d.consult_first ?? [],
  };
  // The send's words follow the wire the page has settled on, exact window included.
  const whole = {
    ...vm,
    proposal,
    proposalAction: proposalAction(vm.replyVia ?? null, vm.replyWindow ?? null, sentWords),
  };
  return { ...whole, acts: personActs(whole) };
}

/**
 * The runs that named a person, newest first, each with what became of it: sent, and answered by the run report's own
 * rule (isReplyTo) in the thread the message went to; held back, in the owner's words for why (HELD_REASONS); or not
 * sent. A person's page said nothing about what a playbook or a broadcast had sent them.
 */
function campaignsOf(d: PersonDetailDto, tz: string, nowMs: number): PersonCampaignVM[] {
  const threadOf = new Map<string, string>();
  const repliesIn = new Map<string, string[]>();
  for (const c of d.conversations) {
    for (const m of c.messages) {
      threadOf.set(m.id, c.id);
      if (m.direction === "inbound") repliesIn.set(c.id, [...(repliesIn.get(c.id) ?? []), m.created_at]);
    }
  }
  return (d.campaigns ?? []).map((c) => {
    const at = ts(c.sent_at ?? c.scheduled_for);
    const thread = c.message_id ? threadOf.get(c.message_id) : undefined;
    const sentAt = c.sent_at;
    const replied =
      c.state === "sent" && !!sentAt && !!thread && (repliesIn.get(thread) ?? []).some((x) => isReplyTo(sentAt, x));
    const why = c.reason ? HELD_REASONS[c.reason] : undefined;
    const outcome =
      c.state === "sent"
        ? replied
          ? "Replied"
          : "Sent"
        : c.state === "skipped"
          ? `Held — ${why ?? "held back"}`
          : c.state === "failed"
            ? why
              ? `Didn't send — ${why}`
              : "Didn't send"
            : "Waiting to send";
    return {
      id: c.broadcast_id,
      kind: c.playbook_id ? "playbook" : "broadcast",
      title: c.playbook_id ? c.playbook_name || c.name : c.name,
      when: at !== null ? clockDate(at, tz, nowMs) : "—",
      outcome,
      line: `${c.playbook_id ? "Playbook" : "Broadcast"} · ${outcome}`,
      tone: replied ? "ok" : c.state === "skipped" || c.state === "failed" ? "warn" : "plain",
      to: `broadcasts/run:${c.broadcast_id}`,
    };
  });
}
