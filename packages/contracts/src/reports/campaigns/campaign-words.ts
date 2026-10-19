/**
 * Reports › Campaigns, in words (the Campaigns lens, C4): the sentences and the maps behind the lens's fold (campaign-lens.ts),
 * which only builds the parts and chooses which sentence to say. Each is a constant or a small function of counts, so a page
 * draws a sentence it was handed and writes none of its own, and a test holds each by value.
 *
 * Four rules run through all of them. A share is said only of five or more (REPORT_MIN_N, the reports lenses spec's D9): the
 * head, a card's line and a bar's display say a count under that, and a share set beside the period before follows it (the
 * period before's share only where that period had five to take it of). A number with no source is a dash with words, and a
 * count that is zero is a 0. The windows are the constants the reports count by (the reply window, the 30 days campaign_stuck
 * reads), never a second spelling of them. And a word a provider or a person typed into a column never reaches here: a reason
 * or a failure is one of the product's own, read through the tables it already has (HELD_REASONS, broadcastFailureWords,
 * failureWordsOf); the only names said are the business's own, a run's and a message's.
 *
 * Pure, and only Reports' page reads it (PAGE_ONLY in tooling/scripts/gen/contracts-browser-entry.mjs).
 */
import { broadcastFailureWords, readFailure } from "../../broadcasts/broadcast-failure-words";
import {
  DELIVERY_RECEIPTS_WORDS,
  HELD_REASONS,
  REPLY_DAYS,
  REPLY_WINDOW_WORDS,
  STUCK_DAYS,
} from "../../broadcasts/run-words";
import { failureWordsOf } from "../../conversations/message-words";
import { clockNear, durationWords } from "../../shared/clock";
import { pct } from "../../shared/numbers";
import { capitalize, joinWords, plural } from "../../shared/words";
import { TEMPLATE_STATUS_WORDS } from "../../templates/templates";
import { templateTitle } from "../../templates/template-titles";
import { ownWord } from "../report-mix";
import { REPORT_MIN_N, beforeWords, isThinShare, messagesAnsweredWords } from "../report-tiles";
import type { CampaignNumberDto, CampaignStuckNowDto } from "./campaign-record";

/** A figure with nothing to say: a dash, whose meta says why. */
export const NO_FIGURE = "—";

/* ------------------------------------------------------------------------------------------------ the head */

export const NOTHING_WENT_OUT = "Nothing went out in this period.";

/** What the reach-outs wrote, said after "Nothing went out": they are the only thing that did. Nothing where they wrote none. */
export function reachOutsWroteWords(emails: number, businesses: number | undefined): string {
  if (emails === 0) return "";
  const to = businesses === undefined ? "" : ` to ${plural(businesses, "business", "businesses")}`;
  return ` Your sequences to leads wrote ${plural(emails, "email")}${to}.`;
}

/** The people the period's runs reached, and how many of them wrote back, against the period before's. */
interface HeadFacts {
  messages: number;
  people: number;
  runs: number;
  /** Null where the database did not say. */
  wroteBack: number | null;
  before: { sentTo: number | null; wroteBack: number | null };
  /** The period's name as `rangeLabelOf` says it: "30 days". */
  range: string;
}

/**
 * "240 messages to 180 people over 14 runs; 48 of 180 wrote back (41 the 30 days before)." The clause is a share of the
 * people, so it is said only of five or more; its parenthesis is the period before's count, said where that period had
 * people sent to.
 */
export function peopleHeadWords({ messages, people, runs, wroteBack, before, range }: HeadFacts): string {
  const sentence = `${plural(messages, "message")} to ${plural(people, "person", "people")} over ${plural(runs, "run")}`;
  if (people < REPORT_MIN_N || wroteBack === null) return `${sentence}.`;
  const hadPeople = before.sentTo !== null && before.sentTo > 0 && before.wroteBack !== null;
  const was = hadPeople ? ` (${before.wroteBack === 0 ? "none" : before.wroteBack} ${beforeWords(range)})` : "";
  return `${sentence}; ${wroteBack} of ${people} wrote back${was}.`;
}

/** The head without the ledger: the sends alone, over the sources' runs, and the answered messages from five. */
export function sendsHeadWords(sent: { messages: number; runs: number; replied: number }): string {
  const sentence = `${plural(sent.messages, "message")} over ${plural(sent.runs, "run")}`;
  return sent.messages >= REPORT_MIN_N ? `${sentence}; people wrote back to ${sent.replied} of them.` : `${sentence}.`;
}

/* ------------------------------------------------------------------------------------------------ the strip */

const NO_MESSAGE_SENT = "no message went out in this period";
const NOTHING_SENT = "nothing sent";
const NOBODY_SENT_TO = "nobody was sent a message in this period";
export const NOBODY_IN_PERIOD = "nobody in this period";
/** The line under a yes or a stop: it is the answer to a message of yours, within the reply window. */
export const ANSWER_META = `after a message of yours, ${REPLY_WINDOW_WORDS}`;

/** The messages and runs behind the people sent to; with the sends unread (`messages` null), the runs alone. */
export function sentToMeta(messages: number | null, runs: number): string {
  if (messages === null) return plural(runs, "run");
  return messages === 0 ? NO_MESSAGE_SENT : `${plural(messages, "message")} over ${plural(runs, "run")}`;
}

export function deliveredMeta(delivered: number, sent: number): string {
  return sent === 0 ? NOTHING_SENT : `${delivered} of ${sent} · ${DELIVERY_RECEIPTS_WORDS}`;
}

/**
 * Who wrote back, of whom: "48 of 180 people within 3 days", and the people whose time is not over (`counting`, as the
 * database counts them by the clock, whatever day the window ends: 0 once every send has had its time; null, a count it
 * did not send, says nothing of them).
 */
export function wroteBackMeta(facts: { wroteBack: number; people: number; counting: number | null }): string {
  if (facts.people === 0) return NOBODY_SENT_TO;
  const still =
    facts.counting !== null && facts.counting > 0
      ? `, ${facts.counting} sent to in the last ${REPLY_DAYS} may still answer`
      : "";
  return `${facts.wroteBack} of ${plural(facts.people, "person", "people")} ${REPLY_WINDOW_WORDS}${still}`;
}

/* ------------------------------------------------------------------------------------------------ the funnel */

export const NO_MESSAGE_WENT_OUT = "No message went out in this period.";

/** The verb of a count: "1 was", "0 were", "2 were". */
const wasWere = (n: number): string => (n === 1 ? "was" : "were");

/**
 * The funnel's own sentence: of the messages, how many were delivered, (of WhatsApp's own, how many were read,) and how
 * many were answered, as its last row says it. Shares from five messages, the counts under that.
 */
export function funnelLine(f: {
  sent: number;
  delivered: number;
  read: number;
  readOf: number;
  replied: number;
}): string {
  if (f.sent < REPORT_MIN_N) {
    return `Of ${plural(f.sent, "message")}, ${f.delivered} ${wasWere(f.delivered)} delivered and ${f.replied} ${wasWere(f.replied)} answered.`;
  }
  // A read is a share of WhatsApp's own sends alone: said from five of them, as the head says its people (the Read row keeps the count).
  const read = f.readOf >= REPORT_MIN_N ? `, ${pct(f.read, f.readOf)}% of WhatsApp's were read` : "";
  return `${pct(f.delivered, f.sent)}% were delivered${read} and ${pct(f.replied, f.sent)}% were answered ${REPLY_WINDOW_WORDS}, of ${plural(f.sent, "message")}.`;
}

/* ------------------------------------------------------------------------------------------------ held, stopped, failed */

export const HELD_EMPTY = "Nobody was held back in this period.";
const HELD_OTHER = "Another reason";

/** A reason of the product's own stays; any other word the database sent is "other" (the rows are summed under it). */
export const heldKeyOf = (key: string): string => (ownWord(HELD_REASONS, key) === undefined ? "other" : key);
export const heldReasonWords = (key: string): string => capitalize(ownWord(HELD_REASONS, key) ?? HELD_OTHER);

/** How many of those planned were held back: the messages sent and the people held make the messages planned. */
export const heldBackLine = (held: number, sent: number): string =>
  `${held} of the ${plural(sent + held, "message")} planned ${wasWere(held)} held back or could not be sent.`;

/** Under the Runs that stopped card: the window counts a campaign's and a broadcast's runs; a reach-out's are its own part's (00405). */
const REACH_OUTS_UNDER = "Runs to leads are not counted here.";
export const STOPPED_EMPTY = `No run failed or was canceled in this period. ${REACH_OUTS_UNDER}`;
export const CANCELED_KEY = "canceled";

/** A failure the product has words for stays; any other code is "other" (the rows are summed under it). */
export const stoppedKeyOf = (key: string): string => (readFailure(key) === null ? "other" : key);
export const stoppedWords = (key: string): string =>
  key === CANCELED_KEY ? "Canceled" : capitalize(broadcastFailureWords(key));

export const stoppedLine = (failed: number, canceled: number): string =>
  `${plural(failed, "run")} failed and ${canceled} ${wasWere(canceled)} canceled. ${REACH_OUTS_UNDER}`;

export const FAILED_WHY_EMPTY = "No sent message failed in this period.";
const UNRECORDED_REASON = "Reason not recorded";

/**
 * A failed send's reason in the words the Inbox's thread uses for the same row (failureWordsOf), without their full stop.
 * The words are what its row is counted under: sends that read alike are one row, whatever channel they went by.
 */
export function failedReasonWords(row: { channel: string; code: number | null; kind: string | null }): string {
  const words = failureWordsOf(row.channel, { code: row.code ?? null, kind: row.kind ?? null });
  return words === null ? UNRECORDED_REASON : words.replace(/\.$/, "");
}

export const failedWhyLine = (total: number): string =>
  `${plural(total, "message")} failed after ${total === 1 ? "it was" : "they were"} sent, for the provider's own reason.`;

/* ------------------------------------------------------------------------------------------------ by message, by run */

const BY_MESSAGE_LINE = `A reply is counted only for messages sent more than ${REPLY_DAYS} ago, so each has had its time.`;

/** Under every message's rate: a reply is counted only of sends that have had their time, and how many have not. */
export const byMessageLine = (tooNew: number): string =>
  tooNew === 0
    ? BY_MESSAGE_LINE
    : `${BY_MESSAGE_LINE} ${tooNew} sent since ${tooNew === 1 ? "is" : "are"} not counted yet.`;

/**
 * One message's bar, in words: how many of the sends that have had their time were answered ("30 of 110 were answered": a
 * send is answered, a person writes back), and the share from five of them (isThinShare: under that, the count alone).
 */
export function messageRateWords(m: { sent: number; mature: number; replied: number }): string {
  if (m.mature === 0) return `${m.sent} sent in the last ${REPLY_DAYS}, too new to say`;
  const said = messagesAnsweredWords(m.replied, m.mature);
  return isThinShare(m.mature, REPORT_MIN_N) ? said : `${said}  ${pct(m.replied, m.mature)}%`;
}

/** The runs behind the sends: "From 12 campaign runs and 2 one-off broadcasts." Null where there were none. */
export function runsLineWords(moment: number, broadcast: number): string | null {
  const kinds = [
    moment > 0 ? plural(moment, "campaign run") : null,
    broadcast > 0 ? plural(broadcast, "one-off send") : null,
  ].filter((kind): kind is string => kind !== null);
  return kinds.length === 0 ? null : `From ${joinWords(kinds)}.`;
}

/* ------------------------------------------------------------------------------------------------ time between steps */

/** The rows of a distribution: the bucket's key in the database's answer, and its words. Zero rows are kept. */
type BucketWords = readonly (readonly [key: string, label: string])[];

export const FIRST_REPLY_EMPTY = "No message was answered in this period.";
export const FIRST_REPLY_ROWS: BucketWords = [
  ["m15", "Within 15 minutes"],
  ["h1", "Within an hour"],
  ["h4", "Within 4 hours"],
  ["h24", "Within a day"],
  ["h72", `Within ${REPLY_DAYS}`],
];

export const APPROVAL_EMPTY = "No run waited for your OK in this period.";
export const APPROVAL_ROWS: BucketWords = [
  ["h1", "An hour or less"],
  ["h4", "Up to 4 hours"],
  ["h24", "Up to a day"],
  ["over", "More than a day"],
];

/** A middle is said of five or more; under that the words say there are too few. Null where five had no middle to say. */
export function firstReplyLine(n: number, medianS: number | null): string | null {
  if (n < REPORT_MIN_N)
    return `${plural(n, "message")} ${n === 1 ? "has" : "have"} been answered so far: too few for a middle.`;
  if (medianS === null) return null;
  return `The middle one was answered ${durationWords(medianS)} after it was sent, of ${plural(n, "answered message")}.`;
}

export function approvalLine(n: number, medianS: number | null, skipped = 0): string | null {
  // The runs nobody answered (decision 0064, step 5): skipped at the end of their day, said beside the wait.
  const unanswered = skipped > 0 ? ` ${approvalSkippedLine(skipped)}` : "";
  if (n < REPORT_MIN_N) return `${plural(n, "run")} you approved: too few for a middle.${unanswered}`;
  if (medianS === null) return null;
  return `The middle wait for your OK was ${durationWords(medianS)}, over ${plural(n, "run")} you approved.${unanswered}`;
}

/** The runs skipped because nobody answered before their day ended, in a sentence (decision 0064, step 5). */
export function approvalSkippedLine(skipped: number): string {
  return `${plural(skipped, "run was", "runs were")} skipped: nobody answered before ${skipped === 1 ? "its" : "their"} day ended.`;
}

/* ------------------------------------------------------------------------------------------------ what is stuck now */

/** Runs waiting for an OK, and how many of them are past their day (the verb would refuse them: they can only be skipped). */
export function runsWaitingMeta(n: number, late: number): string {
  if (n === 0) return "nothing is waiting for your OK";
  const one = n === 1;
  if (late === 0) return one ? "it can still be approved" : "they can still be approved";
  if (late >= n) return one ? "it is past its day: skip it" : "they are past their day: skip them";
  return `${late} past their day (skip those), ${n - late} can still be approved`;
}

const RUNS_FAILED_NONE = `no run failed in the last ${STUCK_DAYS}`;
/** What the stuck figure counts that the window's card leaves out: it reads every kind of run (00406), a reach-out's step among them. */
const REACH_OUT_STEP_COUNTS = "a step to leads counts too";

/**
 * The newest failed run, by name, and why (the words are the failure's own, broadcastFailureWords, as they read after a comma),
 * and that a reach-out's step counts among them: the window's Runs that stopped leaves those to the Reach-outs part.
 */
export function failedRunMeta(failed: CampaignStuckNowDto["failed"]): string {
  if (failed.n === 0) return RUNS_FAILED_NONE;
  const what =
    failed.latest === null
      ? `${plural(failed.n, "run")} failed in the last ${STUCK_DAYS}`
      : `the latest: ${failed.latest.name}, ${broadcastFailureWords(failed.latest.failure)}`;
  return `${what} · ${REACH_OUT_STEP_COUNTS}`;
}

export const REPLIES_NONE = "nobody who answered a campaign is waiting";
export const REPLIES_WAITING = `people who answered a campaign in the last ${STUCK_DAYS} and wait for a person`;
const TEMPLATES_NONE = "every WhatsApp message is approved";

/** How many of the messages Meta stopped are named under the figure: the figure's own number says them all. */
const TEMPLATES_TITLED = 2;

/** Up to two of the messages Meta stopped, by title, and how, in the Library's own word for it: "Win-back paused, Spring note refused". */
export function templatesMeta(templates: CampaignStuckNowDto["templates"]): string {
  if (templates.n === 0) return TEMPLATES_NONE;
  return templates.items
    .slice(0, TEMPLATES_TITLED)
    .map((t) => `${templateTitle(t.name)} ${TEMPLATE_STATUS_WORDS[t.status].toLowerCase()}`)
    .join(", ");
}

/** The number's health as a word, and the tone it earns: amber at medium, red once flagged, none otherwise (D10). */
export const NUMBER_HEALTH_WORDS = { ok: "Good", warn: "Medium", danger: "Flagged", unknown: "Not reported" } as const;
export const NUMBER_HEALTH_TONES = {
  ok: {},
  warn: { tone: "warn" },
  danger: { tone: "fail" },
  unknown: {},
} as const;
export const NUMBER_NONE = "no WhatsApp number is connected";
export const NUMBER_UNREAD = "this number could not be read";

/** The health's own label, and when the number was last checked as the workspace's days say it. */
export function numberMeta(number: Extract<CampaignNumberDto, { state: "read" }>, tz: string, nowMs: number): string {
  const at = number.checked_at === null ? NaN : Date.parse(number.checked_at);
  return Number.isNaN(at) ? number.label : `${number.label} · checked ${clockNear(at, tz, nowMs)}`;
}

/* ------------------------------------------------------------------------------------------------ a read that failed */

/** The lens's reads, by the part of the page each feeds. */
export type ReadPart = "campaigns" | "ledger" | "stuck" | "reach_outs";

/** What could not be read, in the words a failed card names it by. */
export const FAILED_WHAT: Readonly<Record<ReadPart, string>> = {
  campaigns: "the campaign numbers",
  ledger: "who it reached and what is stuck",
  stuck: "what is stuck now",
  reach_outs: "the numbers for leads",
};

/** What a part is called among those that could still be read. */
const STILL_READ: Readonly<Record<ReadPart, string>> = {
  campaigns: "the sends and their channels",
  ledger: "who it reached",
  stuck: "what is stuck now",
  reach_outs: "the sequences to leads",
};

export const REST_IS_CURRENT = "The rest of this page is current.";
export const NOTHING_ELSE_READ = "Nothing else on this page could be read either.";

/** What a failed read says still stands, when some of the others failed too. */
export const onlyReadWords = (landed: readonly ReadPart[]): string =>
  `Only ${joinWords(landed.map((part) => STILL_READ[part]))} could be read.`;
