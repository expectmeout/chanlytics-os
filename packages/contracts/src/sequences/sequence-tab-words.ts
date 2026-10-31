/**
 * What a sequence's tabs say past its flow (decision 0060; the canvas's Editor, People and History boards): a step opened
 * to be changed, what needs you in it, and what it sent over a period, day by day. Pure: the clock is an argument, and
 * every number is counted from what the readers answer (sequence-dto.ts), so a figure here is the one Reports says.
 */
import { toSendRowOf, type ToSendRowVM } from "../reach-out/reach-out-approval";
import {
  HELD_REWRITE_ADVICE,
  HELD_TAKE_OUT,
  heldAnswersOf,
  heldCauseOf,
  heldWhyOf,
  markedOpeningOf,
  waitingAnswersOf,
  type HeldAnswer,
  type MarkedOpening,
} from "./sequence-held";
import { isReachOutHold, type ReachOutHold } from "../reach-out/reach-out-words";
import { personHandWords, type HandKind } from "../reach-out/reach-out-hand";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../reach-out/reach-out-replies";
import { REPORT_MIN_N } from "../reports/report-tiles";
import { broadcastFailureWords } from "../broadcasts/broadcast-failure-words";
import { addressOf } from "../activity/record-address";
import { clockHistoryDay, clockNextSend, clockStamp, clockTime, clockWhen, zoneDayKey } from "../shared/clock";
import { pct } from "../shared/numbers";
import { RUN_OPEN_WORDS, RUN_WAITING_SHORT } from "../shell/campaign-rooms";
import { plural } from "../shared/words";
import { DAY_MS } from "../shared/time";
import type { SequenceBatchDto, SequenceHistoryDto, SequencePeopleGroup, SequencePersonDto } from "./sequence-dto";

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
  /** The words written where the step is read (the canvas's step editor): the message's own pane, in place of its preview. */
  editHere: "Edit the words here",
  previewBack: "Back to the preview",
  /** Who the preview is read as: the example, or someone of the batch that waits (the canvas's "As Ana Morales"). */
  as: "As",
  example: (name: string) => `${name}, an example`,
  /** Who gets which: "Ana gets it on WhatsApp." */
  getsIt: (name: string, on: string) => `${name} gets it ${on.charAt(0).toLowerCase()}${on.slice(1)}.`,
  noFirstName: "No first name on file: the message opens “Hi there”.",
  savedIn: (title: string) => `“${title}”, saved in Messages`,
  noMessages: "No message is ready to send yet. Write one in Messages first.",
  /** What a save reaches: a wait counts from each person's next send; new words go once WhatsApp approves them. */
  reaches: (first: boolean) =>
    first
      ? "Your change reaches the next batch"
      : "Your change reaches everyone who gets the step before from now; anyone already waiting keeps their day",
  whatsAppFirst: "WhatsApp reviews new words first; until it approves them, the step keeps the words approved now",
  /**
   * What a call's or a note's change reaches (decision 0065 step 6): its words are read the day it runs, so they reach
   * everyone not on your Today yet; a new wait, only those who get the step before from now.
   */
  handReaches:
    "New words reach everyone not on your Today yet; a new wait, only those who get the step before from now",
  /** A call or a note as it lands on Today for one person (the run's own sentence, personHandWords), for the example. */
  onToday: (kind: HandKind, words: string) => personHandWords(kind, "Dani", words),
} as const;

/** What needs you in a sequence, on its People tab: the emails the check held and those for you to send. */
export const SEQUENCE_NEEDS_WORDS = {
  title: "Needs you",
  held: "Held by the check",
  /** Over the held whose hold judged the lead, never the words (LEAD_HOLDS): what may go as written in one press. */
  sendAll: (n: number) => `Send ${n} anyway`,
  /** Over the held whose words the check faulted: each written again, one press. */
  rewriteAll: (n: number) => `Rewrite all ${n}`,
  rewriting: "Rewriting…",
  rewroteAll: (n: number) => (n === 1 ? "1 opening is being written again" : `${n} openings are being written again`),
  sending: "Sending…",
  wentAll: (n: number) => (n === 1 ? "1 email goes as written" : `${n} emails go as written`),
  toSend: "For you to send from your inbox",
  /** Leads who wrote back, answered in the Inbox (its threads that answered the sequence). */
  wroteBack: "Wrote back",
  inbox: "Inbox",
  /** A reply's own door: its thread in the Inbox, where the answer is written. */
  answer: "Answer",
  /** What they wrote, read: "Wrote back · a question". */
  said: (intent: string) => `Wrote back · ${intent}`,
  oneByOne: "Send them one by one",
  reading: "Reading what it holds…",
  /** What a failed read could not read: "Couldn't read this batch's emails". */
  failed: "this batch’s emails",
  /** A batch whose emails to send this read carries no draft of: its run's sheet in Sent lays them out. */
  inSent: "Open their run",
} as const;

/** An email the check held, as People lays it out: whose, why, and its answers in their own words (heldAnswersOf). */
export interface SequenceHeldVM {
  id: string;
  name: string;
  /** Its lead's id, which opens its sheet over the record. */
  leadId: string | null;
  /** The step it is, from 1: Skip this email from step 2, Take out at step 1. */
  place: number | null;
  why: string;
  /** The opening it would send, the words the check refused marked (markedOpeningOf); null where it has none. */
  opening: MarkedOpening | null;
  /** Why the check held it (contracts REACH_OUT_HOLDS): what decides whether it may go as written with the rest. */
  reason: ReachOutHold;
  answers: HeldAnswer[];
  /** The batch it waits in: what its answer's Open goes to. */
  batchId: string | null;
}

/** Someone whose reply asks for an answer (00455's replied group), as People lists them: what they said, and its thread. */
export interface SequenceWroteBackVM {
  key: string;
  name: string;
  /** "Wrote back · a question", and what the reply said, read. */
  said: string;
  summary: string | null;
  /** The thread in the Inbox the answer is written in; null where the reply has none. */
  answer: string | null;
  /** Where the name opens: the person's page, or the lead's. */
  to: string | null;
}

/** What needs you on People, from its one read: the held, the emails to send, and the batches whose rows say no draft. */
export interface SequenceNeedsVM {
  held: SequenceHeldVM[];
  /**
   * The held that may go as written with one press ("Send N anyway"): those held for who the lead is (a chain, its
   * language, abroad, an address at a customer's domain), whose Include is a judgement of the lead. One held for its words
   * (a claim the record does not back, words that read like spam) or for a check that did not run is answered one by one.
   */
  asIs: SequenceHeldVM[];
  /** The held a Rewrite answers (words the check faulted): each written again in one press. */
  rewrite: SequenceHeldVM[];
  /** One reason they share, said once over them (heldCauseOf); null where they share none. */
  cause: string | null;
  /** What a rewrite does, where an email is held for a claim; null where none is. */
  advice: string | null;
  toSend: (ToSendRowVM & { batchId: string | null })[];
  /** Batches holding an email to send that this read carries no draft of (a server before 00447): their run's sheet lays them out. */
  unread: string[];
  /**
   * Who wrote back and waits for an answer, by name (00455). Null from a server before 00455, whose read has no such
   * group: People then says only how many, as the sequence's needs count them, with the Inbox's door.
   */
  wroteBack: SequenceWroteBackVM[] | null;
}

/** The holds that judge the lead rather than the email's words: an Include of one of these sends the email as written. */
const LEAD_HOLDS: ReadonlySet<ReachOutHold> = new Set<ReachOutHold>(["chain", "language", "abroad", "customer_domain"]);

/**
 * What needs you on a sequence's People, from who is in it (00442 sequence_people, the drafts 00447's): the emails the
 * check held, each with why and its answers in their own words (contracts holdWords, holdDoors, as the run's sheet in Sent
 * says them), and those handed to you to send, each the row every To send draws (toSendRowOf). A held send whose reason
 * is none of the check's is not answerable here and is left out, as the run's sheet leaves it.
 */
export function peopleNeedsOf(
  rows: readonly SequencePersonDto[],
  at: { timezone: string; now: number },
): SequenceNeedsVM {
  const held = rows.flatMap((r): SequenceHeldVM[] => {
    const reason = r.why;
    if (r.group !== "held" || !r.send_id || !isReachOutHold(reason)) return [];
    return [
      {
        id: r.send_id,
        name: r.name ?? SEQUENCE_PEOPLE_WORDS.someone,
        leadId: r.lead_id,
        place: r.place,
        why: heldWhyOf(reason, r.hold_detail),
        opening: markedOpeningOf(r.opening, { reason, detail: r.hold_detail }),
        reason,
        // Its answers as a run's screen offers them, one rule (contracts heldAnswersOf): Take out at step 1.
        answers: heldAnswersOf({ reason, detail: r.hold_detail }, r.place),
        batchId: r.batch_id,
      },
    ];
  });
  const handed = rows.filter((r) => r.group === "to_send" && r.send_id && r.lead_id);
  const toSend = handed.flatMap((r) =>
    r.draft && r.send_id && r.lead_id
      ? [
          {
            ...toSendRowOf(
              {
                send_id: r.send_id,
                lead_id: r.lead_id,
                business_name: r.name ?? SEQUENCE_PEOPLE_WORDS.someone,
                angle: r.draft.angle,
                to: r.draft.to,
                subject: r.draft.subject,
                text: r.draft.text,
                drafted_at: r.draft.drafted_at,
                follow_up: r.draft.follow_up,
              },
              at,
            ),
            batchId: r.batch_id,
          },
        ]
      : [],
  );
  const unread = [...new Set(handed.filter((r) => !r.draft && r.batch_id).map((r) => r.batch_id ?? ""))];
  const asIs = held.filter((h) => LEAD_HOLDS.has(h.reason) && h.answers.some((a) => a.door === "include"));
  const replied = rows.filter((r) => r.group === "replied");
  const wroteBack =
    replied.length > 0 || rows.some((r) => r.reply !== undefined)
      ? replied.map((r): SequenceWroteBackVM => {
          const intent = r.reply?.intent ?? r.why;
          return {
            key: r.lead_id ?? r.contact_id ?? r.enrollment_id ?? "",
            name: r.name ?? SEQUENCE_PEOPLE_WORDS.someone,
            said: SEQUENCE_NEEDS_WORDS.said(
              isReplyIntent(intent) ? REPLY_INTENT_WORDS[intent] : REPLY_INTENT_WORDS.other,
            ),
            summary: r.reply?.summary ?? null,
            answer: r.reply?.conversation_id ? addressOf({ kind: "conversation", id: r.reply.conversation_id }) : null,
            to: r.contact_id
              ? addressOf({ kind: "person", id: r.contact_id })
              : r.lead_id
                ? addressOf({ kind: "lead", id: r.lead_id })
                : null,
          };
        })
      : null;
  const rewrite = held.filter((h) => h.answers.some((a) => a.door === "rewrite"));
  const cause = heldCauseOf(
    rows
      .filter((r) => r.group === "held" && r.send_id && isReachOutHold(r.why))
      .map((r) => ({
        reason: r.why,
        detail: r.hold_detail,
      })),
  );
  const advice = held.some((h) => h.reason === "unbacked_fact") ? HELD_REWRITE_ADVICE : null;
  return { held, asIs, rewrite, cause, advice, toSend, unread, wroteBack };
}

/** The People tab's own words: its rows, its folds and taking someone out. */
export const SEQUENCE_PEOPLE_WORDS = {
  nobody: "Nobody is in it yet.",
  failed: "who is in it",
  someone: "Someone",
  step: (place: number) => `step ${place}`,
  takeOut: HELD_TAKE_OUT,
  takeOutAll: (n: number) => `Take these ${n} out`,
  more: (n: number) => `and ${n} more`,
  /** A fold of people still to hear from it: when the soonest of them goes. */
  next: (atMs: number, tz: string, nowMs: number) => clockNextSend(atMs, tz, nowMs),
  /** One up next whose time has come, under its name. */
  goingNow: "going out now",
  /** One waiting for an OK whose time has come: an approval plans it again from then (the reach-out clock's restale). */
  onYourOk: "goes once you approve",
  /** Why someone finished with no reason of their own: they had the last step. */
  lastStep: "had the last step",
  /** A lead added and not planned yet, under its name: when it joined the list. */
  added: "Added",
  addedAt: (at: string) => `Added ${at}`,
  /** Leads added and not planned yet, by the sequence's state: what the Added fold says beside its count. */
  queued: { draft: "they join when you start it", paused: "they wait until it's on", on: "in its next batch" },
  /** Added to one that is on, where its next run is known (leadsPlannedWords): "in the batch planned tomorrow 9:00 AM". */
  queuedAt: (when: string) => `in the batch planned ${when}`,
  /** An email waiting for an OK whose opening the check is writing: asked again, or not written yet. */
  writing: "Its opening is being written…",
} as const;

/**
 * An email waiting for your OK, as People lays it out (30 Oct 2026): the opening it goes with, read before the batch is
 * approved, and what may be done about it alone. The opening is its send's, as the business reads it.
 */
export interface SequenceWaitingEmailVM {
  id: string;
  /** The batch it waits in: what its answer's receipt names. */
  batchId: string | null;
  leadId: string | null;
  name: string;
  /** The opening in its quotes; the words for one being written; null where its step's words have none. */
  opening: string | null;
  /** Its opening is being written: no rewrite is asked while it is. */
  checking: boolean;
  answers: HeldAnswer[];
}

/**
 * When a row under People goes, or went, by its group: a time ahead as the clock says it, and a time already gone never
 * (the walk of 30 Oct 2026 and its review: "step 1 · 5:05 PM" at 7 PM). Up next, it is going out, paced by its mailboxes;
 * waiting for an OK, it goes once you approve, planned again from then; held, nothing: its why says what it waits on. A row
 * that says what happened (left, done, replied) or when one joined says its own time.
 */
export function personWhenWords(group: SequencePeopleGroup, atMs: number, tz: string, nowMs: number): string | null {
  if (atMs > nowMs) return clockStamp(atMs, tz, nowMs);
  if (group === "next") return SEQUENCE_PEOPLE_WORDS.goingNow;
  if (group === "waiting") return SEQUENCE_PEOPLE_WORDS.onYourOk;
  if (group === "held") return null;
  return clockStamp(atMs, tz, nowMs);
}

/**
 * The emails waiting for an OK, from People's read, each with its opening and its answers, both quiet since nothing is
 * wrong with it: Rewrite the opening where it has one, and leaving it out, Take out at step 1 (its lead leaves the
 * sequence) and Skip this email after it, as a held email's (heldAnswersOf). A row from a server that carries no opening
 * is not among them: it is drawn as it was (30 Oct 2026: an OK sent openings the owner never read, five of them guesses).
 */
export function waitingEmailsOf(rows: readonly SequencePersonDto[]): SequenceWaitingEmailVM[] {
  return rows.flatMap((r): SequenceWaitingEmailVM[] => {
    if (r.group !== "waiting" || !r.send_id || r.checked === undefined || r.opening === undefined) return [];
    const opening = r.opening?.trim() || null;
    const checking = !r.checked;
    return [
      {
        id: r.send_id,
        batchId: r.batch_id,
        leadId: r.lead_id,
        name: r.name ?? SEQUENCE_PEOPLE_WORDS.someone,
        opening: checking ? SEQUENCE_PEOPLE_WORDS.writing : opening ? `“${opening}”` : null,
        checking,
        answers: waitingAnswersOf({ opening, checking }, r.place),
      },
    ];
  });
}

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
  inReports: "Reports",
  /** The batch to come, over the days that went: "Next · goes on its own", or waiting for an OK. */
  upcoming: (waits: boolean) => (waits ? "Next · waits for your OK" : "Next · goes on its own"),
  dayByDay: "Day by day",
  /** Sent, as the card's one large number says it: "19 sent" (its definition is the figure's, on its tip). */
  sent: "sent",
  nothing: "Nothing has gone out yet.",
  nothingIn: "Nothing went out in these days.",
  older: "Older",
  replies: "What came back",
  noReplies: "Nobody has written back to this one yet.",
  everyone: (n: number) => `All ${n} who got it`,
  openRun: RUN_OPEN_WORDS,
  thread: "Thread",
  waits: RUN_WAITING_SHORT,
  counting: "Counting…",
  step: (place: number) => `step ${place}`,
  reading: "Reading the day…",
  /** What a failed read could not read: "Couldn't read this day". */
  failed: "this day",
  /** How many days the counted batches went on: "26 days it sent". */
  days: (n: number) => (n === 0 ? "" : `${plural(n, "day")} it sent`),
  /** The door to the Inbox over the same days (sequenceRepliesRoute): "All 41 replies in the Inbox". */
  inInbox: (n: number) => (n === 1 ? "Its reply in the Inbox" : `All ${n} replies in the Inbox`),
} as const;

/**
 * What the Inbox says while it lists one sequence's replies (sequenceRepliesRoute): whose, over which days, how many, and
 * how many of them are among the threads the Inbox holds (its newest hundred), never a thread that is not there.
 */
export const SEQUENCE_REPLIES_WORDS = {
  period: { "30": "the last 30 days", "90": "the last 90 days", all: "since it began" } as const,
  line: (name: string, period: "30" | "90" | "all", n: number) =>
    n === 0
      ? `Nobody wrote back to ${name} in ${SEQUENCE_REPLIES_WORDS.period[period]}`
      : `${plural(n, "reply", "replies")} to ${name}, ${SEQUENCE_REPLIES_WORDS.period[period]}`,
  /** Some of them are older than the threads the Inbox holds: "9 of them are here; the rest are older". */
  shown: (here: number, n: number) => (here === n ? null : `${here} of them are here; the rest are older`),
  reading: "Reading its replies…",
  failed: "its replies",
  leave: "Show every thread",
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

/**
 * History's figures over the batches of a period: what went, what reached, what was read, who wrote back. Only those its
 * sequence can know (the walk of 30 Oct 2026 read "Read 0 · on WhatsApp" and "Delivered 0 of 1" for leads' email): Read
 * where it sends on WhatsApp, the one channel with a read receipt, and Delivered never for a sequence to leads, whose
 * email goes from a mailbox, which says it left and never whether it arrived (mailbox-reconcile.ts). Unsaid, all four.
 */
export function historyFigures(
  batches: readonly SequenceBatchDto[],
  of: { starts?: string; channels?: readonly string[] } = {},
): SequenceHistoryFigure[] {
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
  const figures: SequenceHistoryFigure[] = [
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
  const whatsapp = !of.channels || of.channels.includes("whatsapp");
  return figures.filter((f) => (f.id === "read" ? whatsapp : f.id === "delivered" ? of.starts !== "leads" : true));
}

/**
 * When a History row goes or went, by the day as History heads one and the time: "Today · 9:00 AM", "Yesterday · 9:00 AM",
 * "Sat · 9:00 AM", "Sat Oct 4 · 9:00 AM"; the batch to come by its own: "Tomorrow · 9:00 AM".
 */
export function historyStamp(atMs: number, tz: string, nowMs: number): string {
  const time = clockTime(atMs, tz);
  if (atMs <= nowMs || zoneDayKey(atMs, tz) === zoneDayKey(nowMs, tz))
    return `${clockHistoryDay(atMs, tz, nowMs)} · ${time}`;
  const when = clockWhen(atMs, tz, nowMs);
  return when.startsWith("tomorrow ") ? `Tomorrow · ${time}` : when;
}

/**
 * The batch to come, History's first row while it is not made yet (contracts sequenceNextOf): who it is for where they are
 * counted, and whether it goes on its own or waits for an OK, by who approves its batches (the record's mode; none set asks).
 */
export function historyUpcomingWords(people: number | null, mode: string | null): { end: string; said: string } {
  const goes = mode === "auto" || mode === "veto";
  return { end: people ? plural(people, "person", "people") : "", said: SEQUENCE_HISTORY_WORDS.upcoming(!goes) };
}

/** How many business days the counted batches of a period went on. */
export function historyDays(batches: readonly SequenceBatchDto[], tz: string): number {
  return new Set(batches.filter(batchWent).map((b) => b.run_for ?? zoneDayKey(Date.parse(b.at), tz))).size;
}

/**
 * Why a batch stopped, as its day says it: a failure of ours (a code, as campaign_stuck tells one) in the owner's words; a
 * sentence a run kept from before codes, as it was written.
 */
const failureSaid = (failure: string): string =>
  /^[a-z_]+(:[a-z]+)?$/.test(failure) ? `stopped: ${broadcastFailureWords(failure)}` : failure;

/** A day's row: what it says at its end ("13 sent"), and under its time what came of them. */
export function historyDayWords(b: SequenceBatchDto, place: string | null): { end: string; said: string } {
  const c = b.counts;
  // A batch not gone yet says who it is for once they are counted; never "0 people" for one whose people are not named yet.
  const forWhom = [b.people > 0 ? plural(b.people, "person", "people") : null, place].filter(Boolean).join(" · ");
  if (b.state === "pending_approval") return { end: SEQUENCE_HISTORY_WORDS.waits, said: forWhom };
  if (b.state === "scheduled") return { end: "Scheduled", said: forWhom };
  if (b.state === "canceled") return { end: "Canceled", said: [place].filter(Boolean).join(" · ") || "Nothing went" };
  // Delivered is the figures' to say over the period; a day says what was read and what came back, a zero said in words.
  const parts = [`${c.read ?? 0} read`, (c.replied ?? 0) > 0 ? `${c.replied} replied` : "no replies"];
  if ((c.held ?? 0) > 0) parts.push(`${c.held} held`);
  if ((c.to_send ?? 0) > 0) parts.push(`${c.to_send} for you to send`);
  if ((c.failed ?? 0) > 0) parts.push(`${c.failed} failed`);
  // A freed time's batch says who took the time it offered (decision 0082), as Today's line says it.
  if (typeof b.took === "number") parts.push(`${b.took} took it`);
  return {
    end: b.state === "sending" ? "Going out" : b.state === "failed" ? "Failed" : `${c.sent ?? 0} sent`,
    // Why a batch stopped, in the owner's words (its run's report said it there; a day that went opens Reports now).
    said: [place, parts.join(" · "), b.failure ? failureSaid(b.failure) : null].filter(Boolean).join(" · "),
  };
}
