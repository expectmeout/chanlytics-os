/**
 * Every sentence the Sequences page says (decision 0060), from what its readers answer (sequence-dto.ts): the list's
 * groups and rows, a sequence's head and its one notice (D8), its flow (what starts it, each step, what stops it), and
 * where each person stands. Pure: the clock and the workspace's word for an appointment are arguments.
 */
import { POLICY_CLASS_WORDS, type PolicyClass, type PolicyMode } from "../config/workspace-config/policy-classes";
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import { campaignRunsOn, nextRunOf } from "../playbooks/playbook-schedule";
import { triggerOf } from "../playbooks/playbook-triggers";
import { clockDate, clockTime, clockWhen, wallClockAt, zoneDayKey } from "../shared/clock";
import { DAY_MS } from "../shared/time";
import { plural } from "../shared/words";
import { RUN_WAITING_SHORT, runApproveWords } from "../shell/campaign-rooms";
import { runWaitsOnYou, type RunDays } from "../waits/waits";
import type { SequenceNeedsDto, SequencePeopleGroup, SequenceRowDto, SequenceStepDto } from "./sequence-dto";
import type { SequenceState } from "./sequence";
import { sequenceRunOff, type RunOffReason } from "./sequence-run-off";

/** The page's own words, said once. */
export const SEQUENCE_WORDS = {
  title: "Sequences",
  newSequence: "New sequence",
  /** The head's way back to Leads, where a trip from a lead did not say its name. */
  backToLeads: "Leads",
  search: "Search sequences",
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
  receptionist: "First contact is your receptionist’s",
  /** Where the receptionist's line opens: Settings › How it answers, as Campaigns' ledger row does (Ruben, 11 Oct 2026). */
  receptionistRoute: "admin/receptionist",
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
  change: "Change",
  edit: "Edit",
  you: "You approve",
  /** The record's line of what goes next: "Next tomorrow 10:00 AM · 3 people". */
  next: "Next",
  /** How long a customer's batch waits for an OK: an OK sends it at once, and the sweep skips it once its day is gone. */
  untilTonight: "until tonight",
  /** Who approves its batches, said in the record's More, where it is changed (Autonomy, for its whole class). */
  whoApproves: "Who approves",
  turnOff: "Turn this off",
  /** A phone dock's Turn on: it asks first, so it says so. */
  resumeAsk: "Turn on…",
  review: "Review",
  answer: "Answer",
} as const;

/**
 * Who approves a sequence's batches, as its head line says it, by the mode its class runs under (the record's `mode`;
 * none set is ask, as the policies read it). Said once, in the line under its name, and in its More, where it is changed.
 */
const SEQUENCE_APPROVAL_WORDS: Record<PolicyMode, string> = {
  auto: "sends on its own",
  veto: "holds each batch for you to stop",
  ask: "asks you first",
  never: "stays quiet",
};

const isApprovalMode = (mode: string | null): mode is PolicyMode =>
  mode !== null && Object.prototype.hasOwnProperty.call(SEQUENCE_APPROVAL_WORDS, mode);

/** Who approves, in the head's words: a mode it does not know is ask's, as the policies read one with no row. */
const sequenceApprovalWords = (mode: string | null): string =>
  isApprovalMode(mode) ? SEQUENCE_APPROVAL_WORDS[mode] : SEQUENCE_APPROVAL_WORDS.ask;

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
 * (playbook-reach.ts), so two running on one moment send each person both. The one made later is the twin, named by the
 * one made first: it is the one that needs you (Turn this off), and the first keeps its place. Null for the first, for
 * any other moment, whose breath and gap already keep a twin from reaching anyone twice, and where nothing else runs on it.
 */
export function sequenceTwinOf(rows: readonly SequenceRowDto[], row: SequenceRowDto): SequenceTwin | null {
  const trigger = row.first?.trigger ?? null;
  if (row.starts !== "moment" || row.state !== "on" || !trigger || triggerOf(trigger)?.kind !== "visit") return null;
  const made = Date.parse(row.created_at);
  const first = (r: SequenceRowDto) => {
    const at = Date.parse(r.created_at);
    return at < made || (at === made && r.id < row.id);
  };
  const twin = rows.find(
    (r) => r.id !== row.id && r.starts === "moment" && r.state === "on" && r.first?.trigger === trigger && first(r),
  );
  return twin ? { id: twin.id, name: twin.name } : null;
}

/** What two sequences on one moment send each person, in a line: a reminder twice, a thank-you twice. */
function twinLineOf(row: Pick<SequenceRowDto, "first">): string {
  const trigger = row.first?.trigger;
  if (trigger === "visit_tomorrow") return "Two reminders go to each person";
  if (trigger === "visited") return "Two thank-yous go to each person";
  return "Two messages go to each person";
}

/** Why a second sequence on a visit moment is refused (the routes that start one): in the owner's words, by its name. */
export const visitTwinWords = (name: string): string =>
  `“${name}” already sends at this moment, so each person would get two. Turn it off first.`;

/** How many of a sequence's people or emails wait for you: the one count the list, the badge, Today and Ask say. */
export function needsCount(n: SequenceNeedsDto): number {
  return n.waiting_people + n.held + n.to_send + n.replies + (n.waiting > 0 && n.waiting_people === 0 ? n.waiting : 0);
}

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

/** What needs you in a sequence, in a few words: "14 wait for your OK · 3 held · 2 wrote back". Empty when nothing does. */
export function needsWords(n: SequenceNeedsDto): string {
  const parts: string[] = [];
  if (n.waiting_people > 0) parts.push(`${n.waiting_people} wait for your OK`);
  else if (n.waiting > 0) parts.push("waits for your OK");
  if (n.held > 0) parts.push(`${n.held} held`);
  if (n.to_send > 0) parts.push(`${n.to_send} for you to send`);
  if (n.replies > 0) parts.push(`${plural(n.replies, "wrote back", "wrote back")} · answer them`);
  return parts.join(" · ");
}

/** What starts a sequence, short: "Before a visit", "Gone quiet", "Joins Regulars", "Salon owners · Queens". */
export function sequenceStartWords(row: SequenceRowDto, word: AppointmentWord): string {
  const W = appointmentWords(word);
  const f = row.first;
  if (row.starts === "date") return "On a date";
  if (row.starts === "leads") return f?.search_name ? `Leads · ${f.search_name}` : "Leads";
  if (row.starts === "list") return f?.list_name ? `Joins ${f.list_name}` : "Joins a list";
  switch (f?.trigger) {
    case "visit_tomorrow":
      return `Before ${W.a}`;
    case "visited":
      return `After ${W.a}`;
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
 * went last. "Fri, Oct 30 · 186 people", "next tomorrow 9:00 AM", "Sent Oct 12 · 184 · 12 replied", "10 in it". A twin
 * says so first (sequenceTwinOf).
 */
export function sequenceRowLine(
  row: SequenceRowDto,
  tz: string,
  nowMs: number,
  twin: SequenceTwin | null = null,
): string {
  if (row.state === "draft") return SEQUENCE_WORDS.notStarted;
  const needs = needsWords(row.needs);
  if (needs) return needs;
  if (twin) return twinLineOf(row);
  if (row.starts === "date" && row.date) {
    const at = Date.parse(row.date.at);
    if (row.last)
      return `Sent ${clockDate(Date.parse(row.last.at), tz, nowMs)} · ${row.last.sent} · ${row.last.replied} replied`;
    return `${clockDate(at, tz, nowMs)} · ${plural(row.date.people, "person", "people")}`;
  }
  if (row.state === "paused") return row.in_it > 0 ? `${row.in_it} waiting` : "Paused";
  if (row.next) return `next ${clockWhen(Date.parse(row.next.at), tz, nowMs)}`;
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
  rec: { word: AppointmentWord; timezone: string; mode: string | null },
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
    const from = row.first?.search_name ? `Leads from “${row.first.search_name}”` : "Leads";
    return `${from} · ${row.first?.owner_sends ? "you send each one" : sequenceApprovalWords(rec.mode)}`;
  }
  return `${sequenceStartWords(row, rec.word)} · ${sequenceApprovalWords(rec.mode)}`;
}

/** When a sequence's next batch goes, and to how many where it is counted; `soon` when its hour has come and it is due. */
export interface SequenceNext {
  at: number;
  people: number | null;
  soon: boolean;
}

/**
 * What goes next, for the line at the top of a record's Steps (the phone review: a reminder's record never said it): the
 * batch already made (waiting, scheduled or going), else, for a sequence on a moment or a list that runs today, its
 * first step's next run by its hour (contracts nextRunOf, the one rule every page asks), which a day's run makes at that
 * hour: today's while it has not run, tomorrow's once it has. `lastRunFor` is the day its first step last ran
 * (`sequence_steps.last_run_for`, the record's read); undefined where the read is from a server before it, which says
 * nothing it cannot know. Null for one paused, ended, a draft, or a one-off (its Starts line says its day).
 */
export function sequenceNextOf(
  row: SequenceRowDto,
  lastRunFor: string | null | undefined,
  tz: string,
  nowMs: number,
): SequenceNext | null {
  if (row.state !== "on" || row.starts === "date") return null;
  if (row.next)
    return { at: Date.parse(row.next.at), people: row.next.people > 0 ? row.next.people : null, soon: false };
  const first = row.first;
  if (lastRunFor === undefined || !first || (row.starts !== "moment" && row.starts !== "list")) return null;
  const now = new Date(nowMs);
  if (!campaignRunsOn(first, { tz, now })) return null;
  const run = nextRunOf({ run_hour: first.run_hour, last_run_for: lastRunFor }, tz, now);
  const today = zoneDayKey(nowMs, tz);
  const day = run.day === "today" ? today : zoneDayKey(wallClockAt(tz, today, 12, 0) + DAY_MS, tz);
  return { at: wallClockAt(tz, day, run.hour, 0), people: null, soon: run.soon };
}

/** The next batch in words, after "Next": "tomorrow 10:00 AM · 3 people", "within the hour". */
export function sequenceNextWords(next: SequenceNext, tz: string, nowMs: number): string {
  const when = next.soon ? "within the hour" : clockWhen(next.at, tz, nowMs);
  return next.people ? `${when} · ${plural(next.people, "person", "people")}` : when;
}

/**
 * A paused sequence's dock on a phone (the canvas's Paused board): it says so, and how many wait for it where any do. Its
 * act is Turn on, asked first. Null for any other, and for a one-off, whose state is its batch's.
 */
export function sequencePausedDock(row: SequenceRowDto): { line: string; fact: string | null } | null {
  if (row.state !== "paused" || row.starts === "date") return null;
  return {
    line: SEQUENCE_STATE_WORDS.paused,
    fact: row.in_it > 0 ? `${plural(row.in_it, "person waits", "people wait")} for it` : null,
  };
}

const isPolicyClass = (c: string | null | undefined): c is PolicyClass =>
  !!c && Object.prototype.hasOwnProperty.call(POLICY_CLASS_WORDS, c);

/**
 * Who approves a sequence's batches, under that item of its More, where it is changed for the whole class (Autonomy):
 * how, and the row it is set on. "Asks you first · Re-engage quiet customers".
 */
export function sequenceWhoApprovesHint(mode: string | null, policyClass: string | null | undefined): string {
  const how = sequenceApprovalWords(mode);
  const said = how.charAt(0).toUpperCase() + how.slice(1);
  return isPolicyClass(policyClass) ? `${said} · ${POLICY_CLASS_WORDS[policyClass].name}` : said;
}

/**
 * Whether a one-off may still be let go of (the run's cancel door, asked first): one scheduled for its day. One waiting
 * for an OK is skipped from its notice; one going, gone, canceled or failed has nothing left to cancel. No door moves a
 * one-off to another day or other people: it is canceled and made again.
 */
export const sequenceCancels = (row: SequenceRowDto): boolean =>
  row.starts === "date" && row.date?.state === "scheduled";

/**
 * The one notice a sequence shows (D8): the most pressing thing that needs you, with its act. Null when nothing does.
 * `words` is the whole sentence (a desk's notice, Ask); `line` and `fact` are a phone's dock, its line and the one fact
 * under it, so the dock says each once and stays one capsule high.
 */
export interface SequenceNotice {
  kind: "waiting" | "off" | "twin" | "held" | "to_send" | "replies" | "words";
  words: string;
  line: string;
  fact: string | null;
  act: string | null;
  /** The batch it is about, when it is one. */
  batchId: string | null;
  /** The step it is about, when it is one (new words turned down): its id and place. */
  stepId: string | null;
  /** A run that did nothing (`off`): why, and the door that mends it where it is one (sequence-run-off.ts). */
  off?: { reason: RunOffReason; mends: "door" | "autonomy" | "end" | null; to: string | null };
}

const noticeOf = (n: Omit<SequenceNotice, "batchId" | "stepId"> & Partial<SequenceNotice>): SequenceNotice => ({
  batchId: null,
  stepId: null,
  ...n,
});

/**
 * Whether a batch waiting for an OK can wait only until its day is gone: a customer's (a moment's, a list's or a step
 * after the first: its audience a playbook's), which the sweep skips once an OK could no longer send it on its day
 * (contracts runApprovalRefusal). A sequence to leads' batch and a one-off wait until they are answered. Its `at` is
 * when it was made, never when it goes: an OK sends it at once.
 */
export const batchWaitsUntilTonight = (batch: Pick<SequenceNeedsDto["batches"][number], "audience">): boolean =>
  batch.audience?.kind === "playbook";

/** A batch waiting for an OK, as the notice says it: its people and how long it waits, the step where there are several. */
function waitingNotice(steps: readonly SequenceStepDto[], batch: SequenceNeedsDto["batches"][number]): SequenceNotice {
  const people = batch.people;
  const place = steps.length > 1 ? steps.find((s) => s.id === batch.step_id)?.place : undefined;
  const until = batchWaitsUntilTonight(batch) ? ` · ${SEQUENCE_WORDS.untilTonight}` : "";
  const fact = [place ? `Step ${place}` : null, until ? SEQUENCE_WORDS.untilTonight : null].filter(Boolean).join(" · ");
  // A batch that names nobody yet (its people are counted as it is planned) is said as the batch, never as "0 people".
  return noticeOf({
    kind: "waiting",
    words:
      people > 0
        ? `${plural(people, "person waits", "people wait")} for your OK${until}`
        : `The next batch waits for your OK${until}`,
    line: people > 0 ? `${people} wait${people === 1 ? "s" : ""} for your OK` : "The next batch waits for your OK",
    fact: fact || null,
    // One word per act, as the run's own sheet and Today's row say it (decision 19 of the spec of 9 Oct 2026).
    act: people > 0 ? runApproveWords(people) : SEQUENCE_WORDS.approve,
    batchId: batch.id,
  });
}

/**
 * The notice: a batch waiting for an OK first, then a twin on its moment (each person gets the same message twice), the
 * emails the check held, those for you to send, the replies to answer, and new words WhatsApp turned down. `twin` is the
 * list's to say (sequenceTwinOf): a reader with one row alone passes none.
 */
export function sequenceNotice(
  row: SequenceRowDto,
  steps: readonly SequenceStepDto[],
  twin: SequenceTwin | null = null,
  lastRun: { off: string | null | undefined; for: string | null | undefined; tz: string; nowMs: number } | null = null,
): SequenceNotice | null {
  const n = row.needs;
  // The batch an OK goes to: the soonest of those an OK can still send (sequenceWaitsNow).
  const batch = n.waiting > 0 ? (n.batches[0] ?? null) : null;
  if (batch) return waitingNotice(steps, batch);
  // On, and its last run did nothing: said with the door that mends it, until a run goes again (sequence-run-off.ts).
  const off = lastRun ? sequenceRunOff(row, lastRun, { tz: lastRun.tz, nowMs: lastRun.nowMs }) : null;
  if (off)
    return noticeOf({
      kind: "off",
      words: off.words,
      line: off.line,
      fact: off.fact,
      act: off.act,
      off: { reason: off.reason, mends: off.mends, to: off.to },
    });
  if (twin)
    return noticeOf({
      kind: "twin",
      words: `${twinLineOf(row)}: “${twin.name}” sends one too`,
      line: twinLineOf(row),
      fact: `“${twin.name}” sends one too`,
      act: SEQUENCE_WORDS.turnOff,
    });
  if (n.held > 0)
    return noticeOf({
      kind: "held",
      words: `${plural(n.held, "email is", "emails are")} held by the check`,
      line: `${n.held} held by the check`,
      fact: null,
      act: SEQUENCE_WORDS.review,
    });
  if (n.to_send > 0)
    return noticeOf({
      kind: "to_send",
      words: `${plural(n.to_send, "email waits", "emails wait")} for you to send`,
      line: `${n.to_send} for you to send`,
      fact: "From your own inbox",
      act: SEQUENCE_WORDS.review,
    });
  if (n.replies > 0)
    return noticeOf({
      kind: "replies",
      words: `${plural(n.replies, "lead wrote back", "leads wrote back")} · answer them`,
      line: `${n.replies} wrote back`,
      fact: "Answer them in the Inbox",
      act: SEQUENCE_WORDS.answer,
    });
  const refused = steps.find((s) => s.next_words?.status === "rejected");
  if (refused)
    return noticeOf({
      kind: "words",
      words: `WhatsApp did not approve step ${refused.place}'s new words${refused.next_words?.rejected_reason ? `: ${refused.next_words.rejected_reason}` : ""}`,
      line: `Step ${refused.place}’s new words turned down`,
      fact: refused.next_words?.rejected_reason ? `WhatsApp: ${refused.next_words.rejected_reason}` : null,
      act: `${SEQUENCE_WORDS.edit} step ${refused.place}`,
      stepId: refused.id,
    });
  return null;
}

/**
 * A one-off's day, in its own tense (the phone review: one that went said "Oct 13 · 8:21 AM, for 3 people" as if to
 * come): to come, "tomorrow 10:00 AM, to 186 people"; gone, "Went Oct 13 · 8:21 AM, to 3 people"; let go of, "Canceled ·
 * it was for Oct 13 · 8:21 AM"; failed, "Didn't go · Oct 13 · 8:21 AM".
 */
function dateSentence(date: NonNullable<SequenceRowDto["date"]>, tz: string, nowMs: number): string {
  const at = Date.parse(date.at);
  const who = plural(date.people, "person", "people");
  if (date.state === "sent") return `Went ${clockDate(at, tz, nowMs)} · ${clockTime(at, tz)}, to ${who}`;
  if (date.state === "canceled") return `Canceled · it was for ${clockWhen(at, tz, nowMs)}`;
  if (date.state === "failed") return `Didn’t go · ${clockWhen(at, tz, nowMs)}`;
  return `${clockWhen(at, tz, nowMs)}, to ${who}`;
}

/** What starts a sequence, in a sentence the flow opens with: "The day before each visit, at 9:00 AM". */
export function sequenceStartsSentence(row: SequenceRowDto, word: AppointmentWord, tz: string, nowMs: number): string {
  const f = row.first;
  if (row.starts === "date" && row.date) return dateSentence(row.date, tz, nowMs);
  if (row.starts === "leads") return f?.search_name ? `A lead joins ${f.search_name}` : "A lead joins the list";
  if (row.starts === "list") return listStartsSentence(f?.list_name ?? null, f?.run_hour ?? null);
  return momentStartsSentence(f?.trigger ?? null, f?.run_hour ?? null, word);
}

/** ", at 9:00 AM": the hour a sequence's runs go, as the flow says it after its moment. */
const atHour = (hour: number): string => `, at ${clockTime(Date.UTC(2026, 0, 1, hour), "UTC")}`;

/**
 * A list's sentence, at its hour: what the flow of a sequence on a list opens with, and what a new one's draft on a list
 * says before it is made (New).
 */
export function listStartsSentence(list: string | null, hour: number | null): string {
  return `Someone joins ${list ?? "the list"}${hour === null ? "" : atHour(hour)}`;
}

/**
 * A moment's sentence, at its hour: what the flow of a sequence on it opens with, and what a new one's draft says before
 * it is made (sequence-draft.ts).
 */
export function momentStartsSentence(trigger: string | null, hour: number | null, word: AppointmentWord): string {
  const W = appointmentWords(word);
  const at = hour === null ? "" : atHour(hour);
  switch (trigger) {
    case "visit_tomorrow":
      return `The day before each ${W.one}${at}`;
    case "visited":
      return `The day after each ${W.one}${at}`;
    case "quiet_30":
      return `When someone has gone quiet for 30 days${at}`;
    case "lapsed":
      return `When someone has had no ${W.one} in 45 days, and nothing booked${at}`;
    case "new_week":
      return `When someone first gets in touch this week${at}`;
    case "phoned_only":
      return `When someone has only ever phoned${at}`;
    case "everyone_monthly":
      return `Once a month, to everyone who said yes${at}`;
    case "proposal_waiting":
      return `When a proposal waits with nothing back${at}`;
    default:
      return `At its moment${at}`;
  }
}

/** A step's wait, on the line before it: "3 days later, if they haven't booked". */
export function sequenceWaitWords(step: Pick<SequenceStepDto, "after_days" | "only_if" | "kind">): string {
  const days = step.after_days ?? 0;
  const lead = step.kind === "reach_out";
  const when = `${plural(days, "day", "days")} later`;
  const noBooking = step.only_if.includes("no_booking");
  const noReply = step.only_if.includes("no_reply") || lead;
  const unless =
    noBooking && noReply
      ? ", if they haven’t booked or written back"
      : noBooking
        ? ", if they haven’t booked"
        : noReply
          ? ", if they haven’t written back"
          : "";
  return `${when}${unless}`;
}

/** The channels a step goes by, in words: "WhatsApp or email, one each". */
export function sequenceChannelsWords(channels: readonly string[]): string {
  const WORD: Record<string, string> = { whatsapp: "WhatsApp", sms: "text", email: "email" };
  const named = channels.map((c) => WORD[c] ?? c);
  // None said is none known (a one-off's channels are its sends'): nothing guessed, where "WhatsApp" was said of any.
  if (named.length <= 1) return named[0] ?? "";
  return `${named.slice(0, -1).join(", ")} or ${named[named.length - 1]}, one each`;
}

/** What stops a sequence, the line its flow ends with. */
export function sequenceStopsSentence(row: SequenceRowDto, steps: readonly SequenceStepDto[]): string {
  if (row.starts === "leads") return "A reply, a booking, a no, a bounce or a stop";
  return stepsStopSentence(steps);
}

/** What stops a customer's steps, said of them alone: what a sequence's flow ends with, and a new one's draft. */
export function stepsStopSentence(steps: readonly { only_if: readonly string[] }[]): string {
  const asks = new Set(steps.flatMap((s) => s.only_if));
  if (steps.length <= 1) return "After this one message";
  if (asks.has("no_booking") && asks.has("no_reply")) return "When they book or write back, or after the last step";
  if (asks.has("no_booking")) return "When they book, or after the last step";
  if (asks.has("no_reply")) return "When they write back, or after the last step";
  return `After step ${steps.length}`;
}

/** What a people group is called on the People tab. */
export const PEOPLE_GROUP_WORDS: Record<SequencePeopleGroup, string> = {
  waiting: "Wait for your OK",
  held: "Held by the check",
  to_send: "For you to send",
  replied: "Wrote back",
  next: "Up next",
  in: "In it",
  done: "Done",
  left: "Left",
};

/** Why someone left, in a few words: a send's reason or a door's word. */
export function sequenceLeftWords(why: string | null): string {
  const WHY: Record<string, string> = {
    booked: "booked",
    replied: "wrote back",
    removed: "taken out",
    started_again: "started again",
    gone: "no longer in People",
    no_yes: "never said yes",
    no_number: "no number",
    stopped: "asked to stop",
    unsubscribed: "unsubscribed",
    no_address: "no address",
    address_stopped: "address stopped",
    no_channel: "no way to reach them",
    outreach_wrote_back: "wrote back",
    outreach_stopped: "you stopped writing",
    outreach_lead_closed: "no longer a lead to write to",
    outreach_suppressed: "unsubscribed",
    outreach_bounced: "bounced",
    outreach_not_a_lead: "no longer in Leads",
    said_no: "said no",
    owner_stopped: "you stopped writing",
    owner_skipped: "you skipped it",
    run_canceled: "its day was canceled",
    owner_took_back: "taken back",
    step_removed: "the step was removed",
    kept_waiting: "kept waiting too long",
    stale: "kept waiting too long",
    bounced: "bounced",
  };
  return why ? (WHY[why] ?? why.replace(/_/g, " ")) : "";
}

/** The People tab's own name: Leads for a sequence to leads, People for any other. */
export const peopleTabWord = (row: Pick<SequenceRowDto, "starts">): string =>
  row.starts === "leads" ? SEQUENCE_WORDS.tabs.leads : SEQUENCE_WORDS.tabs.people;
