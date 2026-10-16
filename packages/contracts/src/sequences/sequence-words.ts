/**
 * Every sentence the Sequences page says (decision 0060), from what its readers answer (sequence-dto.ts): the list's
 * groups and rows, a sequence's head and its one notice (D8), its flow (what starts it, each step, what stops it), and
 * where each person stands. Pure: the clock and the workspace's word for an appointment are arguments.
 */
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import { clockDate, clockTime, clockWhen } from "../shared/clock";
import { plural } from "../shared/words";
import { runWaitsOnYou, type RunDays } from "../waits/waits";
import type { SequenceNeedsDto, SequencePeopleGroup, SequenceRowDto, SequenceStepDto } from "./sequence-dto";
import type { SequenceState } from "./sequence";

/** The page's own words, said once. */
export const SEQUENCE_WORDS = {
  title: "Sequences",
  newSequence: "New sequence",
  search: "Search sequences",
  empty: "Nothing sends on its own yet. A sequence starts at a moment, when someone joins a list, or on a date.",
  failed: "The sequences couldn’t be loaded right now",
  filters: { all: "All", needs: "Needs you", off: "Paused or off" },
  groups: { needs: "Needs you", customers: "Your customers", leads: "Leads", dates: "Dates", drafts: "Drafts" },
  receptionist: "First contact is your receptionist’s",
  /** Where the receptionist's line opens: Settings › Business, as Campaigns' ledger row did (Ruben, 11 Oct 2026). */
  receptionistRoute: "admin/workspace",
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
} as const;

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
  /** New words a step waits on WhatsApp for, and its answer where it said no. */
  newWords: (name: string, rejected: boolean) =>
    `New words “${name}” wait for WhatsApp${rejected ? ", which did not approve them" : ""}`,
  sample: "The next one, as it reads",
  addLeads: "Add leads",
  /** When the step's next batch goes, with how many where they are counted: "next 9 tomorrow 9:00 AM". */
  next: (people: number, when: string) => (people > 0 ? `next ${people} ${when}` : `next ${when}`),
} as const;

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

/** The groups the list draws, in their order: what needs you first, then by how each starts, and the drafts last. */
export const SEQUENCE_GROUPS = ["needs", "customers", "leads", "dates", "drafts"] as const;
export type SequenceGroup = (typeof SEQUENCE_GROUPS)[number];

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

/** Which of the list's groups a sequence is drawn in. */
export function sequenceGroupOf(row: SequenceRowDto): SequenceGroup {
  // A draft stays in the list under Drafts until it is started: nothing of it goes, so nothing of it needs you.
  if (row.state === "draft") return "drafts";
  if (needsCount(row.needs) > 0) return "needs";
  if (row.starts === "leads") return "leads";
  if (row.starts === "date") return "dates";
  return "customers";
}

/** Whether a sequence is paused or off: the list's second filter. */
export const isOff = (row: SequenceRowDto): boolean => row.state === "paused" || row.state === "ended";

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
      pending_approval: "Waits for you",
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
 * A list row's second line, after what starts it: what needs you where something does, else what comes next or what
 * went last. "Fri, Oct 30 · 186 people", "next tomorrow 9:00 AM", "Oct 12 · sent to 184 · 12 replied", "10 in it".
 */
export function sequenceRowLine(row: SequenceRowDto, tz: string, nowMs: number): string {
  if (row.state === "draft") return SEQUENCE_WORDS.notStarted;
  const needs = needsWords(row.needs);
  if (needs) return needs;
  if (row.starts === "date" && row.date) {
    const at = Date.parse(row.date.at);
    if (row.last)
      return `${clockDate(Date.parse(row.last.at), tz, nowMs)} · sent to ${row.last.sent} · ${row.last.replied} replied`;
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

/** The one notice a sequence shows (D8): the most pressing thing that needs you, with its act. Null when nothing does. */
export interface SequenceNotice {
  kind: "waiting" | "held" | "to_send" | "replies" | "words";
  words: string;
  act: string | null;
  /** The batch it is about, when it is one. */
  batchId: string | null;
}

export function sequenceNotice(
  row: SequenceRowDto,
  steps: readonly SequenceStepDto[],
  tz: string,
  nowMs: number,
): SequenceNotice | null {
  const n = row.needs;
  // The batch an OK goes to: the soonest of those an OK can still send (sequenceWaitsNow).
  const batch = n.waiting > 0 ? (n.batches[0] ?? null) : null;
  if (batch) {
    const when = clockWhen(Date.parse(batch.at), tz, nowMs);
    const people = batch.people;
    // A batch that names nobody yet (its people are counted as it is planned) is said as the batch, never as "0 people".
    return {
      kind: "waiting",
      words:
        people > 0
          ? `${plural(people, "person waits", "people wait")} for your OK · they go ${when}`
          : `The next batch waits for your OK · it goes ${when}`,
      act: people > 0 ? `${SEQUENCE_WORDS.approve} the ${people}` : SEQUENCE_WORDS.approve,
      batchId: batch.id,
    };
  }
  if (n.held > 0)
    return {
      kind: "held",
      words: `${plural(n.held, "email is", "emails are")} held by the check`,
      act: null,
      batchId: null,
    };
  if (n.to_send > 0)
    return {
      kind: "to_send",
      words: `${plural(n.to_send, "email waits", "emails wait")} for you to send`,
      act: null,
      batchId: null,
    };
  if (n.replies > 0)
    return {
      kind: "replies",
      words: `${plural(n.replies, "lead wrote back", "leads wrote back")} · answer them`,
      act: null,
      batchId: null,
    };
  const refused = steps.find((s) => s.next_words?.status === "rejected");
  if (refused)
    return {
      kind: "words",
      words: `WhatsApp did not approve step ${refused.place}'s new words${refused.next_words?.rejected_reason ? `: ${refused.next_words.rejected_reason}` : ""}`,
      act: SEQUENCE_WORDS.edit,
      batchId: null,
    };
  return null;
}

/** What starts a sequence, in a sentence the flow opens with: "The day before each visit, at 9:00 AM". */
export function sequenceStartsSentence(row: SequenceRowDto, word: AppointmentWord, tz: string, nowMs: number): string {
  const f = row.first;
  if (row.starts === "date" && row.date)
    return `${clockWhen(Date.parse(row.date.at), tz, nowMs)}, for ${plural(row.date.people, "person", "people")}`;
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
  if (named.length <= 1) return named[0] ?? "WhatsApp";
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
