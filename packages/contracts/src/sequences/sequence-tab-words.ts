/**
 * What a sequence's tabs say past its flow (decision 0060; the canvas's Editor, People and History boards): a step opened
 * to be changed, what needs you in it, and what it sent over a period, day by day. Pure: the clock is an argument, and
 * every number is counted from what the readers answer (sequence-dto.ts), so a figure here is the one Reports says.
 */
import { REPORT_MIN_N } from "../reports/report-tiles";
import { zoneDayKey } from "../shared/clock";
import { pct } from "../shared/numbers";
import { plural } from "../shared/words";
import { DAY_MS } from "../shared/time";
import type { SequenceBatchDto, SequenceHistoryDto } from "./sequence-dto";

/** A step opened to be changed (the canvas's Editor board): its fields, what a save reaches, and its preview. */
export const SEQUENCE_EDIT_WORDS = {
  after: "After the step before",
  days: (n: number) => (n === 1 ? "1 day" : `${n} days`),
  only: "Only",
  /** What must still hold for a step after the first to go, as the editor offers it. */
  holds: {
    always: "Whatever they did since",
    no_booking: "If they haven’t booked",
    no_reply: "If they haven’t written back",
    neither: "If they haven’t booked or written back",
  },
  message: "Message",
  value: (at: number) => `Value ${at + 1}`,
  cancel: "Cancel",
  save: "Save",
  add: "Add the step",
  previewAs: "As one person reads it",
  oneEach: "Each person gets one version, on the channel they are reached on.",
  inMessages: "Change the words in Messages",
  savedIn: (title: string) => `“${title}”, saved in Messages`,
  noMessages: "No message is ready to send yet. Write one in Messages first.",
  /** What a save reaches: a wait counts from each person's next send; new words go once WhatsApp approves them. */
  reaches: (first: boolean) =>
    first
      ? "Your change reaches the next batch"
      : "Your change reaches everyone who gets the step before from now; anyone already waiting keeps their day",
  whatsAppFirst: "WhatsApp reviews new words first; until it approves them, the step keeps the words approved now",
} as const;

/** What needs you in a sequence, on its People tab: the emails the check held and those for you to send. */
export const SEQUENCE_NEEDS_WORDS = {
  title: "Needs you",
  held: "Held by the check",
  sendAll: (n: number) => (n === 1 ? "Send it as it is" : `Send all ${n} as they are`),
  sending: "Sending…",
  wentAll: (n: number) => (n === 1 ? "1 email goes as it is" : `${n} emails go as they are`),
  toSend: "For you to send from your inbox",
  oneByOne: "Send them one by one",
  reading: "Reading what it holds…",
  /** What a failed read could not read: "Couldn't read this batch's emails". */
  failed: "this batch’s emails",
} as const;

/** The People tab's own words: its rows, its folds and taking someone out. */
export const SEQUENCE_PEOPLE_WORDS = {
  nobody: "Nobody is in it yet.",
  failed: "who is in it",
  someone: "Someone",
  step: (place: number) => `step ${place}`,
  takeOut: "Take out",
  takeOutAll: (n: number) => `Take these ${n} out`,
  more: (n: number) => `and ${n} more`,
  /** A fold of people still to hear from it: when the soonest of them goes. */
  next: (when: string) => `next ${when}`,
  /** Why someone finished with no reason of their own: they had the last step. */
  lastStep: "had the last step",
} as const;

/** The periods History counts over: the kit's segmented choice, the last 30 days first. */
export const SEQUENCE_HISTORY_PERIODS = [
  { id: "30", label: "30 days", days: 30 },
  { id: "90", label: "90 days", days: 90 },
  { id: "all", label: "All", days: null },
] as const;
export type SequenceHistoryPeriod = (typeof SEQUENCE_HISTORY_PERIODS)[number]["id"];

/** History's own words. */
export const SEQUENCE_HISTORY_WORDS = {
  period: "Over",
  inReports: "Open in Reports",
  dayByDay: "Day by day",
  nothing: "Nothing has gone out yet.",
  nothingIn: "Nothing went out in these days.",
  older: "Older",
  replies: "What came back",
  noReplies: "Nobody has written back to this one yet.",
  everyone: (n: number) => `All ${n} who got it`,
  openRun: "Open the run",
  thread: "Thread",
  waits: "Waits for you",
  counting: "Counting…",
  step: (place: number) => `step ${place}`,
  reading: "Reading the day…",
  /** What a failed read could not read: "Couldn't read this day". */
  failed: "this day",
  /** How many days the counted batches went on: "26 days it sent". */
  days: (n: number) => (n === 0 ? "" : `${plural(n, "day")} it sent`),
} as const;

/** What a figure counts, and what it does not: said on the label's tooltip. */
const DEFINITIONS = {
  sent: "Messages that left, one a person a step. Held, skipped and failed sends are not counted.",
  delivered:
    "Of those sent, the share the channel says reached the person: WhatsApp's and a text's receipts, an email accepted.",
  read: "WhatsApp's own read receipt. Email and text do not say when they are read, so they are not counted here.",
  replied: "People who wrote back in their own words within three days of the message, as Reports counts them.",
} as const;

/** One of History's four figures, as the kit's Figure takes it. */
export interface SequenceHistoryFigure {
  id: "sent" | "delivered" | "read" | "replied";
  label: string;
  value: string;
  meta: string | null;
  definition: string;
  /** The count a share is of (the sends), for the kit to grey a share of too few. */
  n: number | null;
  /** The fewest sends a share says anything of (Reports' own, REPORT_MIN_N); null for a figure that is no share. */
  minN: number | null;
}

/** A batch that went (or began to): what History counts and opens onto. One waiting, scheduled or canceled sent nothing. */
export const batchWent = (b: Pick<SequenceBatchDto, "state">): boolean =>
  b.state === "sent" || b.state === "sending" || b.state === "failed";

/** The first business day a period counts, or null for all of it. */
export function historySince(period: SequenceHistoryPeriod, tz: string, nowMs: number): string | null {
  const p = SEQUENCE_HISTORY_PERIODS.find((x) => x.id === period);
  return p && p.days !== null ? zoneDayKey(nowMs - (p.days - 1) * DAY_MS, tz) : null;
}

/** The batches a period holds: those whose day falls on or after its first. */
export function historyIn(batches: readonly SequenceBatchDto[], since: string | null, tz: string): SequenceBatchDto[] {
  return since === null
    ? [...batches]
    : batches.filter((b) => (b.run_for ?? zoneDayKey(Date.parse(b.at), tz)) >= since);
}

/** Whether the pages read so far reach back past a period's first day: if not, an older page holds some of it. */
export function historyCovers(
  h: Pick<SequenceHistoryDto, "batches" | "more">,
  since: string | null,
  tz: string,
): boolean {
  if (!h.more) return true;
  if (since === null) return false;
  const last = h.batches[h.batches.length - 1];
  return !!last && (last.run_for ?? zoneDayKey(Date.parse(last.at), tz)) < since;
}

/** History's four figures over the batches of a period: what went, what reached, what was read, who wrote back. */
export function historyFigures(batches: readonly SequenceBatchDto[]): SequenceHistoryFigure[] {
  const went = batches.filter(batchWent);
  const sum = (k: "sent" | "delivered" | "read" | "replied") => went.reduce((n, b) => n + (b.counts[k] ?? 0), 0);
  const sent = sum("sent");
  const delivered = sum("delivered");
  const read = sum("read");
  const replied = sum("replied");
  const share = (n: number) => {
    const p = pct(n, sent);
    return p === null ? "—" : `${p}%`;
  };
  return [
    { id: "sent", label: "Sent", value: String(sent), meta: null, definition: DEFINITIONS.sent, n: null, minN: null },
    {
      id: "delivered",
      label: "Delivered",
      value: share(delivered),
      meta: sent > 0 ? `${delivered} of ${sent}` : null,
      definition: DEFINITIONS.delivered,
      n: sent,
      minN: REPORT_MIN_N,
    },
    {
      id: "read",
      label: "Read",
      value: String(read),
      meta: "on WhatsApp",
      definition: DEFINITIONS.read,
      n: null,
      minN: null,
    },
    {
      id: "replied",
      label: "Replied",
      value: String(replied),
      meta: sent > 0 ? `${share(replied)} of those sent` : null,
      definition: DEFINITIONS.replied,
      n: null,
      minN: null,
    },
  ];
}

/** How many business days the counted batches of a period went on. */
export function historyDays(batches: readonly SequenceBatchDto[], tz: string): number {
  return new Set(batches.filter(batchWent).map((b) => b.run_for ?? zoneDayKey(Date.parse(b.at), tz))).size;
}

/** A day's row: what it says at its end ("13 sent"), and under its time what came of them. */
export function historyDayWords(b: SequenceBatchDto, place: string | null): { end: string; said: string } {
  const c = b.counts;
  // A batch not gone yet says who it is for once they are counted; never "0 people" for one whose people are not named yet.
  const forWhom = [b.people > 0 ? plural(b.people, "person", "people") : null, place].filter(Boolean).join(" · ");
  if (b.state === "pending_approval") return { end: SEQUENCE_HISTORY_WORDS.waits, said: forWhom };
  if (b.state === "scheduled") return { end: "Scheduled", said: forWhom };
  if (b.state === "canceled") return { end: "Canceled", said: [place].filter(Boolean).join(" · ") || "Nothing went" };
  const parts = [`${c.delivered ?? 0} delivered`, `${c.read ?? 0} read`, `${c.replied ?? 0} replied`];
  if ((c.held ?? 0) > 0) parts.push(`${c.held} held`);
  if ((c.to_send ?? 0) > 0) parts.push(`${c.to_send} for you to send`);
  if ((c.failed ?? 0) > 0) parts.push(`${c.failed} failed`);
  return {
    end: b.state === "sending" ? "Going out" : b.state === "failed" ? "Failed" : `${c.sent ?? 0} sent`,
    said: [place, parts.join(" · "), b.failure].filter(Boolean).join(" · "),
  };
}
