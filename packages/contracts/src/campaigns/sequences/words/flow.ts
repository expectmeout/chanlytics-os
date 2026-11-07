/** Words: flow. */

import { appointmentWords, type AppointmentWord } from "../../../journey/appointment-word";
import { triggerOf } from "../../playbooks/triggers/notices";
import { clockDate, clockNextSend, clockWhen } from "../../../shared/clock";
import { plural } from "../../../shared/words";
import { CAMPAIGN_ROOMS, RUN_WAITING_SHORT } from "../../../shell/campaign-rooms";
import { runWaitsOnYou, type RunDays } from "../../../waits/waits";
import type { SequenceRowDto } from "../dto";
import { SEQUENCE_MODE_WORDS, isSequenceMode, type SequenceState } from "../sequence";
import { needsCount, needsWords } from "../list";
import type { ReachOutFedBy } from "../../reach-out/leads/lines";

/** The page's own words, said once. */
export const SEQUENCE_WORDS = {
  title: CAMPAIGN_ROOMS.sequences,
  /** The head's way back to Leads, where a trip from a lead did not say its name. */
  backToLeads: "Leads",
  /** A phone record's Back, where Leads opened it: the way back is the screen's only one. */
  backToLeadsLabel: "Back to Leads",
  search: "Search sequences",
  /** The list's views over its search (Pipeline's "All deals ⌄"): every sequence, or one of its groups. */
  views: { label: "Which sequences", all: "All sequences" },
  empty: "Nothing sends on its own yet. A sequence starts at a moment, when someone joins a list, or on a date.",
  failed: "The sequences couldn’t be loaded right now",
  filters: { all: "All", needs: "Needs you", off: "Paused or off" },
  groups: {
    needs: "Needs you",
    customers: "Your customers",
    leads: "Leads",
    dates: "Dates",
    off: "Paused",
    drafts: "Drafts",
    ended: "Ended",
  },
  /** The Ended group, folded at the list's foot: what it holds is history, opened when asked for. */
  showEnded: (n: number) => `Show ${n} ended`,
  hideEnded: "Hide ended",
  /** End it (a customer's sequence that has sent), asked first in the record's More: it sends nothing more, its history stays. */
  end: "End it",
  endAsk: (name: string) => `End “${name}”?`,
  endDetail: "It sends nothing more and nobody is added to it; what it sent stays in its History.",
  endedLine: "Ended · it sends nothing more. What it sent stays in its History.",
  tabs: { steps: "Steps", people: "People", leads: "Leads", history: "History" },
  addFollowUp: "Add a follow-up",
  approve: "Approve",
  skip: "Skip",
  skipAsk: "Skip this batch?",
  skipDetail: "Nobody in it gets this step from this batch; the sequence goes on with its next one.",
  lookFirst: "Look first",
  pause: "Pause",
  resume: "Turn on",
  start: "Start",
  discard: "Discard",
  notStarted: "Not started · nothing goes yet",
  /** A message sent once, kept as a draft (00465): it waits under Drafts until it is sent. */
  keptOnce: "Kept as a draft · nothing goes until you send it",
  change: "Change",
  edit: "Edit",
  you: "You approve",
  /** The record's line of what goes next: "Next tomorrow 10:00 AM · 3 people". */
  next: "Next",
  /** Its line once that time has come: "Going out now · 3 people". */
  goingOut: (people: number | null) =>
    people ? `Going out now · ${plural(people, "person", "people")}` : "Going out now",
  /** How long a customer's batch waits for an OK: an OK sends it at once, and the sweep skips it once its day is gone. */
  untilTonight: "until tonight",
  /** A phone dock's line over a batch waiting for an OK: its Approve says how many (the run review's item 12, 19 Oct 2026). */
  waitsForOk: "Waits for your OK",
  /** Approve while an opening of its batch is being written: you read each before it goes, so it waits for them. */
  openingsWriting: "Writing openings…",
  /** Who approves a sequence to leads fed by a list: each first email waits for an OK (00426), whatever its mode. */
  asksFirstEmail: "asks you before each first email",
  /** Who approves its batches, said in the record's More, which opens How it runs, where it is changed (decision 0064). */
  whoApproves: "Who approves",
  turnOff: "Turn this off",
  /** A phone dock's Turn on: it asks first, so it says so. */
  resumeAsk: "Turn on…",
  review: "Review",
  answer: "Answer",
} as const;

/**
 * Who approves a sequence's batches, as its head line says it, by its own mode (decision 0064, the row's `mode`); a mode
 * it does not know is ask's (contracts batchModeOf, fail safe). Said once, in the line under its name, and in its More,
 * which opens How it runs, where it is changed.
 */
export const sequenceApprovalWords = (mode: string | null): string =>
  SEQUENCE_MODE_WORDS[isSequenceMode(mode) ? mode : "ask"].line;

/** The flow's own words (the canvas's Steps board): its keys, the step's lines, and what each part of it says. */
export const SEQUENCE_FLOW_WORDS = {
  starts: "Starts",
  stops: "Stops",
  stopsAlways: "never to anyone who said stop",
  from: "From",
  noMessage: "No message yet",
  sent: "sent",
  replied: "replied",
  last30: "last 30 days",
  takeAway: "Take away",
  hour: "Sends at",
  saveHour: "Save",
  cancel: "Cancel",
  goingNow: "Going now",
  done: "Done",
  writtenEach: "Written for each business",
  call: "A call for you, on Today",
  sendsFrom: "Sends from",
  fromYou: "You, from your own inbox",
  fromMailboxes: "Your connected mailboxes",
  connect: "Connect a mailbox",
  mailboxes: "Mailboxes",
  checked: "Each one is checked before it goes",
  takeAwayAsk: (place: number) => `Take step ${place} away?`,
  takeAwayDetail: "The steps after it go with it; nobody waiting for it hears more from this sequence.",
  /** A call or a note asked away: it is always the last step, so nothing goes with it. */
  takeAwayHandDetail: "Nobody still waiting for it lands on your Today.",
  /** New words a step waits on WhatsApp for, or that WhatsApp turned down: said without the message's stored name. */
  newWords: (rejected: boolean) =>
    rejected ? "WhatsApp turned down the new words" : "New words in review with WhatsApp",
  /** Under a step whose new words wait or were turned down: what it sends meanwhile. */
  keepsWords: "Keeps sending these words until new ones are approved",
  /** A step whose message the workspace no longer offers (deleted, hidden, or never synced here). */
  messageGone: "Its message isn’t in Messages anymore.",
  pickMessage: "Pick a message",
  /** A one-off that waits for its day, let go of (the run's cancel door), asked first. */
  cancelSend: "Cancel this send…",
  cancelAsk: "Cancel this send?",
  cancelDetail: "Nobody gets it. To send it on another day, make it again.",
  cancelYes: "Cancel the send",
  /** A step after a reminder refused (the door): a reminder is said once, the day before; after the visit is its own moment. */
  noFollowUpOnReminder:
    "A reminder goes once, the day before. To write to them afterwards, start a sequence that sends after it.",
  /** A step's change refused by the door (decision 0065 step 6): a message step keeps a message, a call or a note its words. */
  handOnMessage: "This step sends a message. To call them instead, add a call as the last step.",
  valuesOnHand: "A call or a note has no message to fill. Change what it says to do instead.",
  channelsOnHand: "A call or a note lands on your Today, so it goes by no channel.",
  /** A step added after a call or a note, refused by the door before the database would (00465). */
  nothingAfterHand: "A call or a note is always the last step. Take it away to add another after it.",
  /** A step's add with neither a message nor a call or a note (the step verb's refusal). */
  sayWhatStepDoes: "Say which message the step sends, or what to do.",
  sample: "The next one, as it reads",
  addLeads: "Add leads",
  /** When the step's next batch goes, with how many where they are counted: "next 9 tomorrow 9:00 AM". */
  next: (people: number, when: string) => (people > 0 ? `next ${people} ${when}` : `next ${when}`),
} as const;

/**
 * Whether a sequence takes a step after its first (D6): a customer's, on a moment or a list, but never a reminder before a
 * visit, which is said once (the phone review: its "if they haven't booked" could never hold for someone booked). The
 * page offers Add a follow-up by it, and the door refuses by it.
 */
export function takesFollowUps(row: Pick<SequenceRowDto, "starts" | "first">): boolean {
  if (row.starts !== "moment" && row.starts !== "list") return false;
  return row.first?.trigger !== "visit_tomorrow";
}

/** A message's WhatsApp standing, as a step's line says it beside its words: the tone the kit's pill draws it in. */
export function stepApprovalOf(
  status: string | null | undefined,
): { label: string; tone: "ok" | "warn" | "danger" } | null {
  if (status === "approved") return { label: "Approved", tone: "ok" };
  if (status === "pending") return { label: "In review", tone: "warn" };
  if (status === "rejected") return { label: "Not approved", tone: "danger" };
  if (status === "paused" || status === "disabled") return { label: "Paused by WhatsApp", tone: "danger" };
  return null;
}

/** Where a lead's step stands in its sequence: gone out, going now, or still to come (the Leads board's nodes). */
export function leadStepStand(place: number, sent: number, now: number | null): "done" | "now" | "later" {
  if (now !== null && place === now) return "now";
  if (now !== null ? place < now : sent > 0) return "done";
  return "later";
}

/**
 * The groups the list draws, in their order: what needs you first, then by how each starts, what is paused or ended, and
 * the drafts last.
 */
export const SEQUENCE_GROUPS = ["needs", "customers", "leads", "dates", "off", "drafts", "ended"] as const;

export type SequenceGroup = (typeof SEQUENCE_GROUPS)[number];

/** Another sequence that sends at the same moment as this one, by its name: what a person would get twice. */
export interface SequenceTwin {
  id: string;
  name: string;
}

/**
 * The sequence running on the same visit moment as this one, where this one runs too (B1 of the phone review, 16 Oct
 * 2026): a reminder the day before, or a thank-you the day after, is owed once per visit and skips the week's breath
 * (playbooks/reach.ts), so two running on one moment send each person both. The one made later is the twin, named by the
 * one made first: it is the one that needs you (Turn this off), and the first keeps its place. Null for the first, for
 * any other moment, whose breath and gap already keep a twin from reaching anyone twice, and where nothing else runs on it.
 */
export function sequenceTwinOf(rows: readonly SequenceRowDto[], row: SequenceRowDto): SequenceTwin | null {
  const trigger = row.first?.trigger ?? null;
  if (row.starts !== "moment" || row.state !== "on" || !trigger || triggerOf(trigger)?.kind !== "visit") return null;
  const created = Date.parse(row.created_at);
  const first = (r: SequenceRowDto) => {
    const at = Date.parse(r.created_at);
    return at < created || (at === created && r.id < row.id);
  };
  const twin = rows.find(
    (r) => r.id !== row.id && r.starts === "moment" && r.state === "on" && r.first?.trigger === trigger && first(r),
  );
  return twin ? { id: twin.id, name: twin.name } : null;
}

/** What two sequences on one moment send each person, in a line: a reminder twice, a thank-you twice. */
export function twinLineOf(row: Pick<SequenceRowDto, "first">): string {
  const trigger = row.first?.trigger;
  if (trigger === "visit_tomorrow") return "Two reminders go to each person";
  if (trigger === "visited") return "Two thank-yous go to each person";
  return "Two messages go to each person";
}

/** Why a second sequence on a visit moment is refused (the routes that start one): in the owner's words, by its name. */
export const visitTwinWords = (name: string): string =>
  `“${name}” already sends at this moment, so each person would get two. Turn it off first.`;

/**
 * A sequence as the badge counts it (decision 0048's one count): only the batches an OK can still send wait for you,
 * judged as every Approve is (contracts runWaitsOnYou, by the business's day); a batch whose day has passed is no one's
 * to approve, and is neither counted nor offered. The server's reader asks it of every row it answers.
 */
export function sequenceWaitsNow(row: SequenceRowDto, days: RunDays): SequenceRowDto {
  const batches = row.needs.batches.filter((b) =>
    runWaitsOnYou(
      { state: "pending_approval", playbook_id: b.step_id, run_for: b.run_for, audience: b.audience },
      days,
    ),
  );
  if (batches.length === row.needs.batches.length && batches.length === row.needs.waiting) return row;
  return {
    ...row,
    needs: {
      ...row.needs,
      batches,
      waiting: batches.length,
      waiting_people: batches.reduce((n, b) => n + b.people, 0),
    },
  };
}

/**
 * Which of the list's groups a sequence is drawn in: a draft under Drafts, what needs you (people or emails waiting, or a
 * twin sending each person the same moment twice) first, a sequence paused under Paused, one ended under Ended (folded at
 * the list's foot), and the rest by how it starts. A one-off that went stays among the Dates, where it is looked for.
 */
export function sequenceGroupOf(row: SequenceRowDto, twin: SequenceTwin | null = null): SequenceGroup {
  // A draft stays in the list under Drafts until it is started: nothing of it goes, so nothing of it needs you.
  if (row.state === "draft") return "drafts";
  if (needsCount(row.needs) > 0 || twin) return "needs";
  if (row.starts === "date") return "dates";
  if (row.state === "ended") return "ended";
  if (row.state === "paused") return "off";
  if (row.starts === "leads") return "leads";
  return "customers";
}

/** What starts a sequence, short: "Before a visit", "Gone quiet", "Joins Regulars", "Salon owners · Queens". */
export function sequenceStartWords(row: SequenceRowDto, word: AppointmentWord): string {
  const words = appointmentWords(word);
  const first = row.first;
  if (row.starts === "date") return "On a date";
  if (row.starts === "leads") return first?.search_name ? `Leads · ${first.search_name}` : "Leads";
  if (row.starts === "list") return first?.list_name ? `Joins ${first.list_name}` : "Joins a list";
  switch (first?.trigger) {
    case "visit_tomorrow":
      return `Before ${words.a}`;
    case "visited":
      return `After ${words.a}`;
    case "quiet_30":
    case "lapsed":
      return "Gone quiet";
    case "new_week":
      return "New this week";
    case "phoned_only":
      return "Only ever phoned";
    case "everyone_monthly":
      return "Each month";
    case "proposal_waiting":
      return "Proposal out";
    default:
      return "At a moment";
  }
}

/** The state a list row's pill says: a one-off's by its batch, any other's by the sequence. */
export function sequenceStateWords(row: SequenceRowDto): string {
  if (row.starts === "date" && row.date) {
    const DATE: Record<string, string> = {
      pending_approval: RUN_WAITING_SHORT,
      scheduled: "Scheduled",
      sending: "Sending",
      sent: "Sent",
      canceled: "Canceled",
      failed: "Failed",
    };
    return DATE[row.date.state] ?? "Scheduled";
  }
  return SEQUENCE_STATE_WORDS[row.state];
}

/** A sequence's state in a word, on its pill: a draft's before it is made too (New). */
export const SEQUENCE_STATE_WORDS: Record<SequenceState, string> = {
  draft: "Draft",
  on: "On",
  paused: "Paused",
  ended: "Ended",
};

/**
 * The tone of that pill (the kit's tones), the state's alone: a one-off waiting for you is amber, one that failed red, what
 * is on green, the rest plain. What needs you in a sequence that runs is said on its line, in amber (sequenceRowLine).
 */
export function sequenceStateTone(row: SequenceRowDto): "warn" | "ok" | "plain" | "danger" {
  if (row.starts === "date" && row.date?.state === "pending_approval") return "warn";
  if (row.starts === "date" && row.date?.state === "failed") return "danger";
  if (row.state === "on") return "ok";
  return "plain";
}

/**
 * The word a list row ends on, where its state is not the ordinary one (the phone review, 16 Oct 2026: a green On on
 * every row said nothing): a sequence paused or ended, a one-off scheduled, going, canceled or failed. Null for one that
 * runs, a draft (its group says it), a one-off that waits for you or went (its line says it).
 */
export function sequenceRowState(row: SequenceRowDto): { label: string; tone: "plain" | "danger" } | null {
  if (row.starts === "date" && row.date) {
    const DATE: Record<string, string> = { scheduled: "Scheduled", sending: "Sending", canceled: "Canceled" };
    if (row.date.state === "failed") return { label: "Failed", tone: "danger" };
    const label = DATE[row.date.state];
    return label ? { label, tone: "plain" } : null;
  }
  if (row.state === "paused" || row.state === "ended") return { label: SEQUENCE_STATE_WORDS[row.state], tone: "plain" };
  return null;
}

/**
 * A list row's second line, after what starts it: what needs you where something does, else what comes next or what
 * went last. "Fri, Oct 30 · 186 people", "next tomorrow 9:00 AM", "Sent Oct 12 · 184 people · 12 replied", "10 in it". A
 * twin says so first (sequenceTwinOf). A count says what it counts: "Sent Oct 12 · 184 · 12 replied" read as a stray number
 * under "Dec 29 · 5 people" (the sample walk, 18 Oct 2026).
 */
export function sequenceRowLine(
  row: SequenceRowDto,
  tz: string,
  nowMs: number,
  twin: SequenceTwin | null = null,
): string {
  if (row.state === "draft") return row.once ? SEQUENCE_WORDS.keptOnce : SEQUENCE_WORDS.notStarted;
  const needs = needsWords(row.needs);
  if (needs) return needs;
  if (twin) return twinLineOf(row);
  if (row.starts === "date" && row.date) {
    const at = Date.parse(row.date.at);
    if (row.last)
      return `Sent ${clockDate(Date.parse(row.last.at), tz, nowMs)} · ${plural(row.last.sent, "person", "people")} · ${row.last.replied} replied`;
    // Still to go, it says when, as its toast did ("Goes at 2:40 PM"); gone without a report yet, the day it went.
    const when = at > nowMs ? `Goes ${clockWhen(at, tz, nowMs).replace(/^today /, "at ")}` : clockDate(at, tz, nowMs);
    return `${when} · ${plural(row.date.people, "person", "people")}`;
  }
  if (row.state === "paused") return row.in_it > 0 ? `${row.in_it} waiting` : "Paused";
  if (row.next) return clockNextSend(Date.parse(row.next.at), tz, nowMs);
  if (row.in_it > 0) return `${row.in_it} in it`;
  if (row.last)
    return `${clockDate(Date.parse(row.last.at), tz, nowMs)} · ${row.last.sent} sent · ${row.last.replied} replied`;
  return "Nobody yet";
}

/** A sequence's head line under its name: "Before a visit · one message · since Sep 18". */
export function sequenceHeadLine(row: SequenceRowDto, word: AppointmentWord, tz: string, nowMs: number): string {
  const steps = row.steps <= 1 ? "one message" : `${row.steps} steps`;
  return `${sequenceStartWords(row, word)} · ${steps} · since ${clockDate(Date.parse(row.created_at), tz, nowMs)}`;
}

/**
 * The line under a record's name on its page (the phone review): what starts it and who approves its batches, each said
 * once there, so the flow never repeats them and no box at its foot says them again. "Before a meeting · sends on its
 * own"; a sequence to leads names its search and says it waits on your inbox where you send each one; a one-off says it
 * is one message and where it stands, in its own tense: "One message · went Oct 13".
 */
export function sequenceSubLine(
  row: SequenceRowDto,
  rec: { word: AppointmentWord; timezone: string; fed_by?: ReachOutFedBy },
  nowMs: number,
): string {
  if (row.starts === "date" && row.date) {
    const at = Date.parse(row.date.at);
    const DATE: Record<string, string> = {
      pending_approval: "waits for your OK",
      scheduled: "goes on its own",
      sending: "going out now",
      sent: `went ${clockDate(row.last ? Date.parse(row.last.at) : at, rec.timezone, nowMs)}`,
      canceled: "canceled",
      failed: "didn’t go",
    };
    return `One message · ${DATE[row.date.state] ?? "goes on its own"}`;
  }
  if (row.starts === "leads") {
    // A search named as the sequence is not said again under its name (3 Nov 2026: "Local: your receptionist is built"
    // read 'Leads from "Local: your receptionist is built"' beneath itself).
    const search = row.first?.search_name?.trim() ?? "";
    const from = search && search.toLowerCase() !== row.name.trim().toLowerCase() ? `Leads from “${search}”` : "Leads";
    // Fed by a list, each first email waits for an OK whatever its mode (00426: each of its leads was added by hand).
    const asks = rec.fed_by === "list" ? SEQUENCE_WORDS.asksFirstEmail : sequenceApprovalWords(row.mode);
    return `${from} · ${row.first?.owner_sends ? "you send each one" : asks}`;
  }
  return `${sequenceStartWords(row, rec.word)} · ${sequenceApprovalWords(row.mode)}`;
}
