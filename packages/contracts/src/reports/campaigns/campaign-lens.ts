/**
 * Reports › Campaigns (the Campaigns lens, C4): what the lens's three reads say once they are put together. The sends
 * (campaign_series, folded by toCampaignReportVM, which the Campaigns home reads too), the ledger the route answers (the
 * window's people, runs, holds, stops, failures, messages and waits, and what is stuck now, judged: campaign-record.ts) and
 * the reach-outs (toReachOutLensVM) each arrive or do not, alone, and the lens says what stands. Five parts: the sentence
 * and five figures against the period before; the window's mixes (the funnel, what was held back, what stopped, why sends
 * failed, each message's rate, how soon a reply and an approval came); what is stuck now; the reach-outs; and what could not
 * be read. Every sentence is campaign-words.ts's; this chooses which to say, from counts it has checked.
 *
 * A person and a message are different units and are never added: the head counts people (a person once, however many
 * messages they were sent) and the funnel counts messages. A share is said of five or more and carries the count it is of
 * for the kit to grey; a number with no source is a dash with words; and a count the database did not send is not said, never
 * read as a zero (a database answers the container, and not every leaf is promised). Pure: the page feeds it the reads and
 * the clock, and only Reports' page reads it (PAGE_ONLY in tooling/scripts/gen/contracts-browser-entry.mjs).
 */
import { pct, sumOf } from "../../shared/numbers";
import { isCount } from "../../shared/unknown";
import { languageLabels } from "../../templates/message-languages";
import { templateTitle } from "../../templates/template-titles";
import {
  campaignPriorHadAny,
  toCampaignReportVM,
  type CampaignReportDto,
  type CampaignReportVM,
} from "../campaign-report";
import type { ReachOutReportDto } from "../reach-out-report";
import { barsOf, noMix, rankedEntries, type MixEntry, type MixPartVM, type RateRowVM } from "../report-mix";
import { REPORT_MIN_N, compareWords, shareWasWords, type ReportStripTile } from "../report-tiles";
import { rangeLabelOf } from "../reports";
import type { CampaignLedgerDto, CampaignLedgerSeriesDto, CampaignStuckNowDto } from "./campaign-record";
import {
  ANSWER_META,
  APPROVAL_EMPTY,
  approvalSkippedLine,
  APPROVAL_ROWS,
  CANCELED_KEY,
  FAILED_WHAT,
  FAILED_WHY_EMPTY,
  FIRST_REPLY_EMPTY,
  FIRST_REPLY_ROWS,
  HELD_EMPTY,
  NOBODY_IN_PERIOD,
  NOTHING_ELSE_READ,
  NOTHING_WENT_OUT,
  NO_FIGURE,
  NO_MESSAGE_WENT_OUT,
  NUMBER_HEALTH_TONES,
  NUMBER_HEALTH_WORDS,
  NUMBER_NONE,
  NUMBER_UNREAD,
  REPLIES_NONE,
  REPLIES_WAITING,
  REST_IS_CURRENT,
  STOPPED_EMPTY,
  approvalLine,
  byMessageLine,
  deliveredMeta,
  failedReasonWords,
  failedRunMeta,
  failedWhyLine,
  firstReplyLine,
  funnelLine,
  peopleHeadWords,
  heldKeyOf,
  heldBackLine,
  heldReasonWords,
  messageRateWords,
  numberMeta,
  onlyReadWords,
  reachOutsWroteWords,
  runsLineWords,
  runsWaitingMeta,
  sendsHeadWords,
  sentToMeta,
  stoppedKeyOf,
  stoppedLine,
  stoppedWords,
  templatesMeta,
  wroteBackMeta,
  type ReadPart,
} from "./campaign-words";
import { toReachOutLensVM, type ReachOutLensVM } from "./reach-out-lens";

/** The three reads: the sends, the ledger the route answers (null where it failed), and the reach-outs (undefined in the demo). */
export interface CampaignLensInput {
  campaigns: CampaignReportDto | null;
  ledger: CampaignLedgerDto | null;
  reachOuts: ReachOutReportDto | null | undefined;
}

/** A figure of the lens: the strip's tile, with the count a share is of (`n`), the page a count opens (`door`) and the tone of its number where it has them. */
export type CampaignFigureVM = ReportStripTile;

export interface CampaignLensVM {
  /** The lens's sentence; null where the sends could not be read. */
  head: string | null;
  /** How each read went: `missing` is a function the database lacks (no failure, no words), `none` the reach-outs of a demo. */
  reads: {
    campaigns: "ok" | "failed";
    ledger: "ok" | "missing" | "failed";
    stuck: "ok" | "missing" | "failed";
    reachOuts: "ok" | "failed" | "none";
  };
  /** One entry for each read that failed, with what stands. */
  failed: Array<{ part: ReadPart; what: string; body: string }>;
  /** Nothing went out, nothing was held, no run stopped and nobody answered: the lens draws one card, and what is stuck and the reach-outs. */
  quiet: boolean;
  /** The existing fold of the sends: the days, the channels, the sources and the tables. */
  report: CampaignReportVM | null;
  /** [people sent to, delivered, wrote back, said yes, asked to stop]; three without the ledger. */
  strip: CampaignFigureVM[];
  funnel: MixPartVM;
  held: MixPartVM;
  stopped: MixPartVM;
  failedWhy: MixPartVM;
  byMessage: { rows: RateRowVM[]; line: string | null; empty: string | null };
  /** "From 12 campaign runs and 2 one-off broadcasts." */
  runsLine: string | null;
  firstReply: MixPartVM;
  approval: MixPartVM;
  /** [runs waiting, failed runs, replies waiting, messages Meta stopped, your number]; empty where not read. */
  stuck: CampaignFigureVM[];
  /** Null where the reach-outs were not read or failed. */
  reachOuts: ReachOutLensVM | null;
}

type Series = CampaignLedgerSeriesDto;
type Reads = CampaignLensVM["reads"];

/** A count the database sent, or null where it sent none: a leaf that is not there is not said. */
const knownCount = (v: unknown): number | null => (isCount(v) ? v : null);

/* ------------------------------------------------------------------------------------------------ what was read */

function readsOf({ campaigns, ledger, reachOuts }: CampaignLensInput): Reads {
  return {
    campaigns: campaigns === null ? "failed" : "ok",
    ledger: ledger === null ? "failed" : ledger.series === null ? "missing" : "ok",
    stuck: ledger === null || ledger.stuck_failed === true ? "failed" : ledger.stuck === null ? "missing" : "ok",
    reachOuts: reachOuts === undefined ? "none" : reachOuts === null ? "failed" : "ok",
  };
}

/** Each read that failed says what, and what still stands; a ledger that failed took what is stuck with it, and says so once. */
function failedReads(reads: Reads): CampaignLensVM["failed"] {
  const status: Array<[ReadPart, string]> = [
    ["campaigns", reads.campaigns],
    ["ledger", reads.ledger],
    ["stuck", reads.stuck],
    ["reach_outs", reads.reachOuts],
  ];
  const failing = status.filter(([part, is]) => is === "failed" && !(part === "stuck" && reads.ledger === "failed"));
  const landed = status.filter(([, is]) => is === "ok").map(([part]) => part);
  const others =
    failing.length === 1 ? REST_IS_CURRENT : landed.length === 0 ? NOTHING_ELSE_READ : onlyReadWords(landed);
  return failing.map(([part]) => ({ part, what: FAILED_WHAT[part], body: others }));
}

/* ------------------------------------------------------------------------------------------------ the window's facts */

/** The people the period's runs reached and how many wrote back, now and before; null for any count the database left out. */
function reachedPeopleOf({ people }: Series) {
  return {
    sentTo: knownCount(people.now.sent_to),
    wroteBack: knownCount(people.now.wrote_back),
    counting: knownCount(people.now.counting),
    before: { sentTo: knownCount(people.before.sent_to), wroteBack: knownCount(people.before.wrote_back) },
  };
}

/** The runs that sent, by kind, and their sum; the sum only where both kinds are counts. */
function runsOf({ runs }: Series) {
  const moment = knownCount(runs.now.moment);
  const broadcast = knownCount(runs.now.broadcast);
  return { moment, broadcast, total: moment === null || broadcast === null ? null : moment + broadcast };
}

/** Nothing went out and nobody answered, and (where the ledger is read) nothing was held, stopped, failed or approved. */
function isQuiet(report: CampaignReportVM | null, series: Series | null): boolean {
  if (report === null) return false;
  const { sent, optIns, optOuts } = report.totals;
  if (sent + optIns + optOuts > 0) return false;
  if (series === null) return true;
  const { held, stopped, failed_sends, approval, people } = series;
  return [held.total, stopped.failed, stopped.canceled, failed_sends.total, approval.n, people.now.wrote_back].every(
    (n) => n === 0,
  );
}

/* ------------------------------------------------------------------------------------------------ the head */

/** The lens's sentence: how many messages to how many people over how many runs, and how many of them wrote back. */
function campaignHead(report: CampaignReportVM, series: Series | null, reach: ReachOutLensVM | null): string {
  const { sent, replied, sends } = report.totals;
  if (sent === 0) {
    return `${NOTHING_WENT_OUT}${reach === null ? "" : reachOutsWroteWords(reach.totals.written, reach.totals.businesses)}`;
  }
  const people = series === null ? null : reachedPeopleOf(series);
  const runs = series === null ? null : runsOf(series).total;
  if (series === null || people === null || people.sentTo === null || runs === null) {
    return sendsHeadWords({ messages: sent, runs: sends, replied });
  }
  return peopleHeadWords({
    messages: sent,
    people: people.sentTo,
    runs,
    wroteBack: people.wroteBack,
    before: people.before,
    range: rangeLabelOf(series.days),
  });
}

/* ------------------------------------------------------------------------------------------------ the strip */

/** People sent to, a count against the period before's; said over the messages where the sends were read. */
function sentToFigures(report: CampaignReportVM | null, series: Series | null): CampaignFigureVM[] {
  if (series === null) return [];
  const { sentTo, before } = reachedPeopleOf(series);
  const runs = runsOf(series).total;
  if (sentTo === null || runs === null) return [];
  return [
    {
      id: "people-sent-to",
      metric: "people_sent_to",
      label: "People sent to",
      value: String(sentTo),
      meta: sentToMeta(report === null ? null : report.totals.sent, runs),
      compare:
        before.sentTo === null
          ? null
          : compareWords(sentTo, before.sentTo, rangeLabelOf(series.days), before.sentTo > 0),
    },
  ];
}

/** Delivered: the share of the messages the channel reports delivered, with the count it is of. */
function deliveredShareFigure({ totals, before, days }: CampaignReportVM): CampaignFigureVM {
  const share = pct(totals.delivered, totals.sent);
  return {
    id: "delivered",
    metric: "delivered_share",
    label: "Delivered",
    value: share === null ? NO_FIGURE : `${share}%`,
    meta: deliveredMeta(totals.delivered, totals.sent),
    compare: shareWasWords(totals.sent, { part: before.delivered, of: before.sent }, rangeLabelOf(days)),
    n: totals.sent,
    minN: REPORT_MIN_N,
  };
}

/** Wrote back: the share of the people sent to who answered in their own words, with the count it is of and who is still to. */
function wroteBackFigures(series: Series | null): CampaignFigureVM[] {
  if (series === null) return [];
  const { sentTo, wroteBack, counting, before } = reachedPeopleOf(series);
  if (sentTo === null || wroteBack === null) return [];
  const share = pct(wroteBack, sentTo);
  const was =
    before.sentTo === null || before.wroteBack === null
      ? null
      : shareWasWords(sentTo, { part: before.wroteBack, of: before.sentTo }, rangeLabelOf(series.days));
  return [
    {
      id: "wrote-back",
      metric: "people_wrote_back",
      label: "Wrote back",
      value: share === null ? NO_FIGURE : `${share}%`,
      meta: wroteBackMeta({ wroteBack, people: sentTo, counting }),
      compare: was,
      n: sentTo,
      minN: REPORT_MIN_N,
    },
  ];
}

/** The yeses and the stops, in counts against the period before, where it was lived in (campaignPriorHadAny: it sent, or somebody said yes or stop). */
function answerFigures({ totals, before, days }: CampaignReportVM): CampaignFigureVM[] {
  const priorHadAny = campaignPriorHadAny(before);
  const range = rangeLabelOf(days);
  return [
    {
      id: "said-yes",
      metric: "said_yes",
      label: "Said yes",
      value: String(totals.optIns),
      meta: totals.optIns > 0 ? ANSWER_META : NOBODY_IN_PERIOD,
      compare: compareWords(totals.optIns, before.optIns, range, priorHadAny),
    },
    {
      id: "asked-to-stop",
      metric: "asked_to_stop",
      label: "Asked to stop",
      value: String(totals.optOuts),
      meta: totals.optOuts > 0 ? ANSWER_META : NOBODY_IN_PERIOD,
      compare: compareWords(totals.optOuts, before.optOuts, range, priorHadAny),
    },
  ];
}

/** [people sent to, delivered, wrote back, said yes, asked to stop]; each is said only from the reads it needs. */
function campaignStrip(report: CampaignReportVM | null, series: Series | null): CampaignFigureVM[] {
  return [
    ...sentToFigures(report, series),
    ...(report === null ? [] : [deliveredShareFigure(report)]),
    ...wroteBackFigures(series),
    ...(report === null ? [] : answerFigures(report)),
  ];
}

/* ------------------------------------------------------------------------------------------------ the window's mixes */

/** Counts summed under the key each is said by: the keys the product has no words for are one. A count that is none is left out. */
function sumUnder(counts: Readonly<Record<string, unknown>>, keyOf: (key: string) => string): Record<string, number> {
  const sums = new Map<string, number>();
  for (const [key, n] of Object.entries(counts)) {
    if (isCount(n)) sums.set(keyOf(key), (sums.get(keyOf(key)) ?? 0) + n);
  }
  return Object.fromEntries(sums);
}

/**
 * Sent, delivered, read (WhatsApp's own, where it sent) and answered: messages, with the funnel's own sentence. The last row is
 * "Answered", not the strip's "Wrote back", which counts the people who wrote back: the two never read as one number.
 */
function funnelPart(report: CampaignReportVM | null): MixPartVM {
  if (report === null) return noMix(null);
  const { sent, delivered, read, readOf, replied } = report.totals;
  if (sent === 0) return noMix(NO_MESSAGE_WENT_OUT);
  const entries: MixEntry[] = [
    ["sent", "Sent", sent],
    ["delivered", "Delivered", delivered],
  ];
  if (readOf > 0) entries.push(["read", "Read", read]);
  entries.push(["replied", "Answered", replied]);
  return { rows: barsOf(entries), line: funnelLine({ sent, delivered, read, readOf, replied }), empty: null };
}

/** The people a run did not send to, by reason in the owner's words; and of the messages planned, how many that was. */
function heldPart(report: CampaignReportVM | null, series: Series | null): MixPartVM {
  if (series === null) return noMix(null);
  const { total, by_reason } = series.held;
  if (!isCount(total)) return noMix(null);
  if (total === 0) return noMix(HELD_EMPTY);
  const rows = barsOf(rankedEntries(sumUnder(by_reason, heldKeyOf), heldReasonWords));
  return { rows, line: report === null ? null : heldBackLine(total, report.totals.sent), empty: null };
}

/** The runs that failed, by why, and the ones that were canceled. */
function stoppedPart(series: Series | null): MixPartVM {
  if (series === null) return noMix(null);
  const { failed, canceled, by_failure } = series.stopped;
  if (!isCount(failed) || !isCount(canceled)) return noMix(null);
  if (failed + canceled === 0) return noMix(STOPPED_EMPTY);
  const counts = { ...sumUnder(by_failure, stoppedKeyOf), [CANCELED_KEY]: canceled };
  return { rows: barsOf(rankedEntries(counts, stoppedWords)), line: stoppedLine(failed, canceled), empty: null };
}

/** Why sends failed after they left, in the words the Inbox's thread says for the same row; one row for every send with no reason. */
function failedWhyPart(series: Series | null): MixPartVM {
  if (series === null) return noMix(null);
  const { total, by_code } = series.failed_sends;
  if (!isCount(total)) return noMix(null);
  if (total === 0) return noMix(FAILED_WHY_EMPTY);
  // Sends that read alike are one row, whatever channel they went by: counted under their words.
  const counts = new Map<string, number>();
  for (const row of by_code) {
    if (!isCount(row.n)) continue;
    const why = failedReasonWords(row);
    counts.set(why, (counts.get(why) ?? 0) + row.n);
  }
  const rows = barsOf(rankedEntries(Object.fromEntries(counts), (why) => why));
  return { rows, line: failedWhyLine(total), empty: null };
}

type MessageRow = Series["by_message"][number];

/** A message with its name and language and its sends, mature sends and replies all counts: a row that cannot say them is not drawn. */
const isWholeMessage = (m: MessageRow): boolean =>
  typeof m.name === "string" &&
  typeof m.language === "string" &&
  isCount(m.sent) &&
  isCount(m.mature) &&
  isCount(m.replied);

/**
 * Each message's title; a title in more than one language says which (message-languages' words, told apart where two codes
 * would read alike), so no two rows read alike.
 */
function titledMessages(messages: readonly MessageRow[]): Array<{ message: MessageRow; title: string }> {
  return messages.map((message) => {
    const title = templateTitle(message.name);
    const alike = messages.filter((m) => templateTitle(m.name) === title);
    if (alike.length === 1) return { message, title };
    const language = languageLabels(alike.map((m) => m.language))[message.language] ?? message.language;
    return { message, title: `${title} (${language})` };
  });
}

/** Each message's share of the sends that have had their time that were answered (a bar), and the words that say of how many. */
function byMessagePart(series: Series | null): CampaignLensVM["byMessage"] {
  const none = { rows: [], line: null, empty: null };
  if (series === null) return none;
  if (series.by_message.length === 0) return { ...none, empty: NO_MESSAGE_WENT_OUT };
  const messages = series.by_message.filter(isWholeMessage);
  if (messages.length === 0) return none;
  const tooNew = sumOf(messages.map((m) => Math.max(0, m.sent - m.mature)));
  return {
    rows: titledMessages(messages).map(({ message: m, title }) => ({
      id: `${m.name}:${m.language}`,
      label: title,
      value: pct(m.replied, m.mature) ?? 0,
      display: messageRateWords(m),
      n: m.mature,
      minN: REPORT_MIN_N,
    })),
    line: byMessageLine(tooNew),
    empty: null,
  };
}

/** The runs behind the sends, said by kind. */
function runsLineOf(series: Series | null): string | null {
  if (series === null) return null;
  const { moment, broadcast } = runsOf(series);
  return moment === null || broadcast === null ? null : runsLineWords(moment, broadcast);
}

/** What a distribution is said by: the rows of its buckets, the words for none, and the sentence about its middle. */
interface WaitWords {
  rows: readonly (readonly [key: string, label: string])[];
  empty: string;
  line: (n: number, medianS: number | null, skipped?: number) => string | null;
}

/**
 * A distribution of waits: a row for every bucket, the empty ones kept (it is a distribution, and a missing bucket is not an
 * empty one), and a middle only of five or more.
 */
function waitPart(dist: Series["first_reply"] | Series["approval"] | null, words: WaitWords): MixPartVM {
  if (dist === null || !isCount(dist.n)) return noMix(null);
  // The runs skipped unanswered in the window (the approval's alone, since 00461): said with the wait, or alone.
  const skipped = "skipped" in dist && isCount(dist.skipped) ? dist.skipped : 0;
  // None approved: the ones that waited and were skipped are what is said, never "no run waited" over them.
  if (dist.n === 0) return noMix(skipped > 0 ? approvalSkippedLine(skipped) : words.empty);
  const buckets: Readonly<Record<string, unknown>> = dist.buckets;
  const entries: MixEntry[] = [];
  for (const [key, label] of words.rows) {
    const count = buckets[key];
    if (!isCount(count)) return noMix(null);
    entries.push([key, label, count]);
  }
  const median = typeof dist.median_s === "number" && Number.isFinite(dist.median_s) ? dist.median_s : null;
  return { rows: barsOf(entries), line: words.line(dist.n, median, skipped), empty: null };
}

const FIRST_REPLY_WORDS: WaitWords = { rows: FIRST_REPLY_ROWS, empty: FIRST_REPLY_EMPTY, line: firstReplyLine };
const APPROVAL_WORDS: WaitWords = { rows: APPROVAL_ROWS, empty: APPROVAL_EMPTY, line: approvalLine };

/* ------------------------------------------------------------------------------------------------ what is stuck now */

/** A count of what is stuck: "500+" where the database cut its list there, so the number is a floor. */
const stuckValue = (n: number, capped: boolean): string => (capped ? `${n}+` : String(n));

/** The tone of a number that needs you (`warn`) or that failed (`fail`): on the number, and only when there is one (D10). */
const stuckTone = (n: number, tone: "warn" | "fail"): { tone?: "warn" | "fail" } => (n > 0 ? { tone } : {});

function stuckFiguresOf(stuck: CampaignStuckNowDto, tz: string, nowMs: number): CampaignFigureVM[] {
  const { waiting, failed, replies, templates, number } = stuck;
  const figure = { compare: null } as const;
  const health = number.state === "read" ? number.tone : null;
  return [
    {
      ...figure,
      id: "runs-waiting",
      metric: "runs_waiting",
      label: "Runs waiting for you",
      value: stuckValue(waiting.n, waiting.capped),
      meta: runsWaitingMeta(waiting.n, waiting.late),
      door: "campaigns",
      ...stuckTone(waiting.n, "warn"),
    },
    {
      ...figure,
      id: "runs-failed",
      metric: "runs_failed",
      label: "Failed runs",
      value: stuckValue(failed.n, failed.capped),
      meta: failedRunMeta(failed),
      door: "broadcasts",
      ...stuckTone(failed.n, "fail"),
    },
    {
      ...figure,
      id: "replies-waiting",
      metric: "campaign_replies_waiting",
      label: "Replies that need you",
      value: stuckValue(replies.n, replies.capped),
      meta: replies.n === 0 ? REPLIES_NONE : REPLIES_WAITING,
      door: "inbox",
      ...stuckTone(replies.n, "warn"),
    },
    {
      ...figure,
      id: "templates-paused",
      metric: "templates_paused",
      label: "Messages Meta stopped",
      value: String(templates.n),
      meta: templatesMeta(templates),
      door: "messages",
      ...stuckTone(templates.n, "fail"),
    },
    {
      ...figure,
      id: "number-health",
      metric: "number_health",
      label: "Your WhatsApp number",
      value: health === null ? NO_FIGURE : NUMBER_HEALTH_WORDS[health],
      meta:
        number.state === "read" ? numberMeta(number, tz, nowMs) : number.state === "none" ? NUMBER_NONE : NUMBER_UNREAD,
      door: "admin/integrations",
      ...(health === null ? {} : NUMBER_HEALTH_TONES[health]),
    },
  ];
}

/* ------------------------------------------------------------------------------------------------ the lens */

/** The Campaigns lens's parts, in words, from its three reads and the clock. */
export function toCampaignLensVM(input: CampaignLensInput, nowMs: number): CampaignLensVM {
  const reads = readsOf(input);
  const report = input.campaigns === null ? null : toCampaignReportVM(input.campaigns);
  const series = input.ledger?.series ?? null;
  const stuck = reads.stuck === "ok" ? (input.ledger?.stuck ?? null) : null;
  const reachOuts = input.reachOuts ? toReachOutLensVM(input.reachOuts, nowMs) : null;
  return {
    head: report === null ? null : campaignHead(report, series, reachOuts),
    reads,
    failed: failedReads(reads),
    quiet: isQuiet(report, series),
    report,
    strip: campaignStrip(report, series),
    funnel: funnelPart(report),
    held: heldPart(report, series),
    stopped: stoppedPart(series),
    failedWhy: failedWhyPart(series),
    byMessage: byMessagePart(series),
    runsLine: runsLineOf(series),
    firstReply: waitPart(series?.first_reply ?? null, FIRST_REPLY_WORDS),
    approval: waitPart(series?.approval ?? null, APPROVAL_WORDS),
    stuck: stuck === null || input.ledger === null ? [] : stuckFiguresOf(stuck, input.ledger.timezone, nowMs),
    reachOuts,
  };
}
