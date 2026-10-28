import { pct, sumOf } from "../../shared/numbers.js";
import { isCount } from "../../shared/unknown.js";
import { languageLabels } from "../../templates/message-languages.js";
import { templateTitle } from "../../templates/template-titles.js";
import {
  campaignPriorHadAny,
  toCampaignReportVM
} from "../campaign-report.js";
import { barsOf, noMix, rankedEntries } from "../report-mix.js";
import { REPORT_MIN_N, compareWords, shareWasWords } from "../report-tiles.js";
import { rangeLabelOf } from "../reports.js";
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
  wroteBackMeta
} from "./campaign-words.js";
import { toReachOutLensVM } from "./reach-out-lens.js";
import { SEQUENCES_ROUTE } from "../../sequences/sequence-address.js";
import { MESSAGES_ROUTE } from "../../shell/address.js";
const knownCount = (v) => isCount(v) ? v : null;
function readsOf({ campaigns, ledger, reachOuts }) {
  return {
    campaigns: campaigns === null ? "failed" : "ok",
    ledger: ledger === null ? "failed" : ledger.series === null ? "missing" : "ok",
    stuck: ledger === null || ledger.stuck_failed === true ? "failed" : ledger.stuck === null ? "missing" : "ok",
    reachOuts: reachOuts === void 0 ? "none" : reachOuts === null ? "failed" : "ok"
  };
}
function failedReads(reads) {
  const status = [
    ["campaigns", reads.campaigns],
    ["ledger", reads.ledger],
    ["stuck", reads.stuck],
    ["reach_outs", reads.reachOuts]
  ];
  const failing = status.filter(([part, is]) => is === "failed" && !(part === "stuck" && reads.ledger === "failed"));
  const landed = status.filter(([, is]) => is === "ok").map(([part]) => part);
  const others = failing.length === 1 ? REST_IS_CURRENT : landed.length === 0 ? NOTHING_ELSE_READ : onlyReadWords(landed);
  return failing.map(([part]) => ({ part, what: FAILED_WHAT[part], body: others }));
}
function reachedPeopleOf({ people }) {
  return {
    sentTo: knownCount(people.now.sent_to),
    wroteBack: knownCount(people.now.wrote_back),
    counting: knownCount(people.now.counting),
    before: { sentTo: knownCount(people.before.sent_to), wroteBack: knownCount(people.before.wrote_back) }
  };
}
function runsOf({ runs }) {
  const moment = knownCount(runs.now.moment);
  const broadcast = knownCount(runs.now.broadcast);
  return { moment, broadcast, total: moment === null || broadcast === null ? null : moment + broadcast };
}
function isQuiet(report, series) {
  if (report === null) return false;
  const { sent, optIns, optOuts } = report.totals;
  if (sent + optIns + optOuts > 0) return false;
  if (series === null) return true;
  const { held, stopped, failed_sends, approval, people } = series;
  return [held.total, stopped.failed, stopped.canceled, failed_sends.total, approval.n, people.now.wrote_back].every(
    (n) => n === 0
  );
}
function campaignHead(report, series, reach) {
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
    range: rangeLabelOf(series.days)
  });
}
function sentToFigures(report, series) {
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
      compare: before.sentTo === null ? null : compareWords(sentTo, before.sentTo, rangeLabelOf(series.days), before.sentTo > 0)
    }
  ];
}
function deliveredShareFigure({ totals, before, days }) {
  const share = pct(totals.delivered, totals.sent);
  return {
    id: "delivered",
    metric: "delivered_share",
    label: "Delivered",
    value: share === null ? NO_FIGURE : `${share}%`,
    meta: deliveredMeta(totals.delivered, totals.sent),
    compare: shareWasWords(totals.sent, { part: before.delivered, of: before.sent }, rangeLabelOf(days)),
    n: totals.sent,
    minN: REPORT_MIN_N
  };
}
function wroteBackFigures(series) {
  if (series === null) return [];
  const { sentTo, wroteBack, counting, before } = reachedPeopleOf(series);
  if (sentTo === null || wroteBack === null) return [];
  const share = pct(wroteBack, sentTo);
  const was = before.sentTo === null || before.wroteBack === null ? null : shareWasWords(sentTo, { part: before.wroteBack, of: before.sentTo }, rangeLabelOf(series.days));
  return [
    {
      id: "wrote-back",
      metric: "people_wrote_back",
      label: "Wrote back",
      value: share === null ? NO_FIGURE : `${share}%`,
      meta: wroteBackMeta({ wroteBack, people: sentTo, counting }),
      compare: was,
      n: sentTo,
      minN: REPORT_MIN_N
    }
  ];
}
function answerFigures({ totals, before, days }) {
  const priorHadAny = campaignPriorHadAny(before);
  const range = rangeLabelOf(days);
  return [
    {
      id: "said-yes",
      metric: "said_yes",
      label: "Said yes",
      value: String(totals.optIns),
      meta: totals.optIns > 0 ? ANSWER_META : NOBODY_IN_PERIOD,
      compare: compareWords(totals.optIns, before.optIns, range, priorHadAny)
    },
    {
      id: "asked-to-stop",
      metric: "asked_to_stop",
      label: "Asked to stop",
      value: String(totals.optOuts),
      meta: totals.optOuts > 0 ? ANSWER_META : NOBODY_IN_PERIOD,
      compare: compareWords(totals.optOuts, before.optOuts, range, priorHadAny)
    }
  ];
}
function campaignStrip(report, series) {
  return [
    ...sentToFigures(report, series),
    ...report === null ? [] : [deliveredShareFigure(report)],
    ...wroteBackFigures(series),
    ...report === null ? [] : answerFigures(report)
  ];
}
function sumUnder(counts, keyOf) {
  const sums = /* @__PURE__ */ new Map();
  for (const [key, n] of Object.entries(counts)) {
    if (isCount(n)) sums.set(keyOf(key), (sums.get(keyOf(key)) ?? 0) + n);
  }
  return Object.fromEntries(sums);
}
function funnelPart(report) {
  if (report === null) return noMix(null);
  const { sent, delivered, read, readOf, replied } = report.totals;
  if (sent === 0) return noMix(NO_MESSAGE_WENT_OUT);
  const entries = [
    ["sent", "Sent", sent],
    ["delivered", "Delivered", delivered]
  ];
  if (readOf > 0) entries.push(["read", "Read", read]);
  entries.push(["replied", "Answered", replied]);
  return { rows: barsOf(entries), line: funnelLine({ sent, delivered, read, readOf, replied }), empty: null };
}
function heldPart(report, series) {
  if (series === null) return noMix(null);
  const { total, by_reason } = series.held;
  if (!isCount(total)) return noMix(null);
  if (total === 0) return noMix(HELD_EMPTY);
  const rows = barsOf(rankedEntries(sumUnder(by_reason, heldKeyOf), heldReasonWords));
  return { rows, line: report === null ? null : heldBackLine(total, report.totals.sent), empty: null };
}
function stoppedPart(series) {
  if (series === null) return noMix(null);
  const { failed, canceled, by_failure } = series.stopped;
  if (!isCount(failed) || !isCount(canceled)) return noMix(null);
  if (failed + canceled === 0) return noMix(STOPPED_EMPTY);
  const counts = { ...sumUnder(by_failure, stoppedKeyOf), [CANCELED_KEY]: canceled };
  return { rows: barsOf(rankedEntries(counts, stoppedWords)), line: stoppedLine(failed, canceled), empty: null };
}
function failedWhyPart(series) {
  if (series === null) return noMix(null);
  const { total, by_code } = series.failed_sends;
  if (!isCount(total)) return noMix(null);
  if (total === 0) return noMix(FAILED_WHY_EMPTY);
  const counts = /* @__PURE__ */ new Map();
  for (const row of by_code) {
    if (!isCount(row.n)) continue;
    const why = failedReasonWords(row);
    counts.set(why, (counts.get(why) ?? 0) + row.n);
  }
  const rows = barsOf(rankedEntries(Object.fromEntries(counts), (why) => why));
  return { rows, line: failedWhyLine(total), empty: null };
}
const isWholeMessage = (m) => typeof m.name === "string" && typeof m.language === "string" && isCount(m.sent) && isCount(m.mature) && isCount(m.replied);
function titledMessages(messages) {
  return messages.map((message) => {
    const title = templateTitle(message.name);
    const alike = messages.filter((m) => templateTitle(m.name) === title);
    if (alike.length === 1) return { message, title };
    const language = languageLabels(alike.map((m) => m.language))[message.language] ?? message.language;
    return { message, title: `${title} (${language})` };
  });
}
function byMessagePart(series) {
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
      minN: REPORT_MIN_N
    })),
    line: byMessageLine(tooNew),
    empty: null
  };
}
function runsLineOf(series) {
  if (series === null) return null;
  const { moment, broadcast } = runsOf(series);
  return moment === null || broadcast === null ? null : runsLineWords(moment, broadcast);
}
function waitPart(dist, words) {
  if (dist === null || !isCount(dist.n)) return noMix(null);
  const skipped = "skipped" in dist && isCount(dist.skipped) ? dist.skipped : 0;
  if (dist.n === 0) return noMix(skipped > 0 ? approvalSkippedLine(skipped) : words.empty);
  const buckets = dist.buckets;
  const entries = [];
  for (const [key, label] of words.rows) {
    const count = buckets[key];
    if (!isCount(count)) return noMix(null);
    entries.push([key, label, count]);
  }
  const median = typeof dist.median_s === "number" && Number.isFinite(dist.median_s) ? dist.median_s : null;
  return { rows: barsOf(entries), line: words.line(dist.n, median, skipped), empty: null };
}
const FIRST_REPLY_WORDS = { rows: FIRST_REPLY_ROWS, empty: FIRST_REPLY_EMPTY, line: firstReplyLine };
const APPROVAL_WORDS = { rows: APPROVAL_ROWS, empty: APPROVAL_EMPTY, line: approvalLine };
const stuckValue = (n, capped) => capped ? `${n}+` : String(n);
const stuckTone = (n, tone) => n > 0 ? { tone } : {};
function stuckFiguresOf(stuck, tz, nowMs) {
  const { waiting, failed, replies, templates, number } = stuck;
  const figure = { compare: null };
  const health = number.state === "read" ? number.tone : null;
  const standing = number.state === "read" ? number.standing ?? null : null;
  return [
    {
      ...figure,
      id: "runs-waiting",
      metric: "runs_waiting",
      label: "Runs waiting for you",
      value: stuckValue(waiting.n, waiting.capped),
      meta: runsWaitingMeta(waiting.n, waiting.late),
      door: SEQUENCES_ROUTE,
      ...stuckTone(waiting.n, "warn")
    },
    {
      ...figure,
      id: "runs-failed",
      metric: "runs_failed",
      label: "Failed runs",
      value: stuckValue(failed.n, failed.capped),
      meta: failedRunMeta(failed),
      door: SEQUENCES_ROUTE,
      ...stuckTone(failed.n, "fail")
    },
    {
      ...figure,
      id: "replies-waiting",
      metric: "campaign_replies_waiting",
      label: "Replies that need you",
      value: stuckValue(replies.n, replies.capped),
      meta: replies.n === 0 ? REPLIES_NONE : REPLIES_WAITING,
      door: "inbox",
      ...stuckTone(replies.n, "warn")
    },
    {
      ...figure,
      id: "templates-paused",
      metric: "templates_paused",
      label: "Messages Meta stopped",
      value: String(templates.n),
      meta: templatesMeta(templates),
      door: MESSAGES_ROUTE,
      ...stuckTone(templates.n, "fail")
    },
    {
      ...figure,
      id: "number-health",
      metric: "number_health",
      label: "Your WhatsApp number",
      // What Meta holds against the number is said in the WhatsApp row's own word and sentence, as Connections says it; the
      // rating's word only where nothing is held (the live walk's REP-1: "Flagged" over a payment method).
      value: standing ? standing.word : health === null ? NO_FIGURE : NUMBER_HEALTH_WORDS[health],
      meta: standing ? standing.sentence : number.state === "read" ? numberMeta(number, tz, nowMs) : number.state === "none" ? NUMBER_NONE : NUMBER_UNREAD,
      door: "admin/integrations",
      ...health === null ? {} : NUMBER_HEALTH_TONES[health]
    }
  ];
}
export function toCampaignLensVM(input, nowMs) {
  const reads = readsOf(input);
  const report = input.campaigns === null ? null : toCampaignReportVM(input.campaigns);
  const series = input.ledger?.series ?? null;
  const stuck = reads.stuck === "ok" ? input.ledger?.stuck ?? null : null;
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
    reachOuts
  };
}
