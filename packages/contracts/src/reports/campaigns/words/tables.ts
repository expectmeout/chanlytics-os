/** Words: tables. */

import { broadcastFailureWords } from "../../../campaigns/broadcasts/failure-words";
import { REPLY_DAYS, STUCK_DAYS } from "../../../campaigns/broadcasts/run-words";
import { clockNear, durationWords } from "../../../shared/clock";
import { joinWords, plural } from "../../../shared/words";
import { TEMPLATE_STATUS_WORDS } from "../../../campaigns/templates/templates";
import { templateTitle } from "../../../campaigns/templates/titles";
import { REPORT_MIN_N } from "../../tiles";
import type { CampaignNumberDto, CampaignStuckNowDto } from "../record";

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
export function firstReplyLine(count: number, medianS: number | null): string | null {
  if (count < REPORT_MIN_N)
    return `${plural(count, "message")} ${count === 1 ? "has" : "have"} been answered so far: too few for a middle.`;
  if (medianS === null) return null;
  return `The middle one was answered ${durationWords(medianS)} after it was sent, of ${plural(count, "answered message")}.`;
}

export function approvalLine(count: number, medianS: number | null, skipped = 0): string | null {
  // The runs nobody answered (decision 0064, step 5): skipped at the end of their day, said beside the wait.
  const unanswered = skipped > 0 ? ` ${approvalSkippedLine(skipped)}` : "";
  if (count < REPORT_MIN_N) return `${plural(count, "run")} you approved: too few for a middle.${unanswered}`;
  if (medianS === null) return null;
  return `The middle wait for your OK was ${durationWords(medianS)}, over ${plural(count, "run")} you approved.${unanswered}`;
}

/** The runs skipped because nobody answered before their day ended, in a sentence (decision 0064, step 5). */
export function approvalSkippedLine(skipped: number): string {
  return `${plural(skipped, "run was", "runs were")} skipped: nobody answered before ${skipped === 1 ? "its" : "their"} day ended.`;
}

/* ------------------------------------------------------------------------------------------------ what is stuck now */

/** Runs waiting for an OK, and how many of them are past their day (the verb would refuse them: they can only be skipped). */
export function runsWaitingMeta(count: number, late: number): string {
  if (count === 0) return "nothing is waiting for your OK";
  const one = count === 1;
  if (late === 0) return one ? "it can still be approved" : "they can still be approved";
  if (late >= count) return one ? "it is past its day: skip it" : "they are past their day: skip them";
  return `${late} past their day (skip those), ${count - late} can still be approved`;
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
  const subject =
    failed.latest === null
      ? `${plural(failed.n, "run")} failed in the last ${STUCK_DAYS}`
      : `the latest: ${failed.latest.name}, ${broadcastFailureWords(failed.latest.failure)}`;
  return `${subject} · ${REACH_OUT_STEP_COUNTS}`;
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
