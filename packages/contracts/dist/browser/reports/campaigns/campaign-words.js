import { broadcastFailureWords, readFailure } from "../../broadcasts/broadcast-failure-words.js";
import {
  DELIVERY_RECEIPTS_WORDS,
  HELD_REASONS,
  REPLY_DAYS,
  REPLY_WINDOW_WORDS,
  STUCK_DAYS
} from "../../broadcasts/run-words.js";
import { failureWordsOf } from "../../conversations/message-words.js";
import { clockNear, durationWords } from "../../shared/clock.js";
import { pct } from "../../shared/numbers.js";
import { capitalize, joinWords, plural } from "../../shared/words.js";
import { TEMPLATE_STATUS_WORDS } from "../../templates/templates.js";
import { templateTitle } from "../../templates/template-titles.js";
import { ownWord } from "../report-mix.js";
import { REPORT_MIN_N, beforeWords, isThinShare, messagesAnsweredWords } from "../report-tiles.js";
export const NO_FIGURE = "\u2014";
export const NOTHING_WENT_OUT = "Nothing went out in this period.";
export function reachOutsWroteWords(emails, businesses) {
  if (emails === 0) return "";
  const to = businesses === void 0 ? "" : ` to ${plural(businesses, "business", "businesses")}`;
  return ` Your reach-outs wrote ${plural(emails, "email")}${to}.`;
}
export function peopleHeadWords({ messages, people, runs, wroteBack, before, range }) {
  const sentence = `${plural(messages, "message")} to ${plural(people, "person", "people")} over ${plural(runs, "run")}`;
  if (people < REPORT_MIN_N || wroteBack === null) return `${sentence}.`;
  const hadPeople = before.sentTo !== null && before.sentTo > 0 && before.wroteBack !== null;
  const was = hadPeople ? ` (${before.wroteBack === 0 ? "none" : before.wroteBack} ${beforeWords(range)})` : "";
  return `${sentence}; ${wroteBack} of ${people} wrote back${was}.`;
}
export function sendsHeadWords(sent) {
  const sentence = `${plural(sent.messages, "message")} over ${plural(sent.runs, "run")}`;
  return sent.messages >= REPORT_MIN_N ? `${sentence}; people wrote back to ${sent.replied} of them.` : `${sentence}.`;
}
const NO_MESSAGE_SENT = "no message went out in this period";
const NOTHING_SENT = "nothing sent";
const NOBODY_SENT_TO = "nobody was sent a message in this period";
export const NOBODY_IN_PERIOD = "nobody in this period";
export const ANSWER_META = `after a message of yours, ${REPLY_WINDOW_WORDS}`;
export function sentToMeta(messages, runs) {
  if (messages === null) return plural(runs, "run");
  return messages === 0 ? NO_MESSAGE_SENT : `${plural(messages, "message")} over ${plural(runs, "run")}`;
}
export function deliveredMeta(delivered, sent) {
  return sent === 0 ? NOTHING_SENT : `${delivered} of ${sent} \xB7 ${DELIVERY_RECEIPTS_WORDS}`;
}
export function wroteBackMeta(facts) {
  if (facts.people === 0) return NOBODY_SENT_TO;
  const still = facts.counting !== null && facts.counting > 0 ? `, ${facts.counting} sent to in the last ${REPLY_DAYS} may still answer` : "";
  return `${facts.wroteBack} of ${plural(facts.people, "person", "people")} ${REPLY_WINDOW_WORDS}${still}`;
}
export const NO_MESSAGE_WENT_OUT = "No message went out in this period.";
const wasWere = (n) => n === 1 ? "was" : "were";
export function funnelLine(f) {
  if (f.sent < REPORT_MIN_N) {
    return `Of ${plural(f.sent, "message")}, ${f.delivered} ${wasWere(f.delivered)} delivered and ${f.replied} ${wasWere(f.replied)} answered.`;
  }
  const read = f.readOf >= REPORT_MIN_N ? `, ${pct(f.read, f.readOf)}% of WhatsApp's were read` : "";
  return `${pct(f.delivered, f.sent)}% were delivered${read} and ${pct(f.replied, f.sent)}% were answered ${REPLY_WINDOW_WORDS}, of ${plural(f.sent, "message")}.`;
}
export const HELD_EMPTY = "Nobody was held back in this period.";
const HELD_OTHER = "Another reason";
export const heldKeyOf = (key) => ownWord(HELD_REASONS, key) === void 0 ? "other" : key;
export const heldReasonWords = (key) => capitalize(ownWord(HELD_REASONS, key) ?? HELD_OTHER);
export const heldBackLine = (held, sent) => `${held} of the ${plural(sent + held, "message")} planned ${wasWere(held)} held back or could not be sent.`;
const REACH_OUTS_UNDER = "A reach-out's runs are not counted here.";
export const STOPPED_EMPTY = `No run failed or was canceled in this period. ${REACH_OUTS_UNDER}`;
export const CANCELED_KEY = "canceled";
export const stoppedKeyOf = (key) => readFailure(key) === null ? "other" : key;
export const stoppedWords = (key) => key === CANCELED_KEY ? "Canceled" : capitalize(broadcastFailureWords(key));
export const stoppedLine = (failed, canceled) => `${plural(failed, "run")} failed and ${canceled} ${wasWere(canceled)} canceled. ${REACH_OUTS_UNDER}`;
export const FAILED_WHY_EMPTY = "No sent message failed in this period.";
const UNRECORDED_REASON = "Reason not recorded";
export function failedReasonWords(row) {
  const words = failureWordsOf(row.channel, { code: row.code ?? null, kind: row.kind ?? null });
  return words === null ? UNRECORDED_REASON : words.replace(/\.$/, "");
}
export const failedWhyLine = (total) => `${plural(total, "message")} failed after ${total === 1 ? "it was" : "they were"} sent, for the provider's own reason.`;
const BY_MESSAGE_LINE = `A reply is counted only for messages sent more than ${REPLY_DAYS} ago, so each has had its time.`;
export const byMessageLine = (tooNew) => tooNew === 0 ? BY_MESSAGE_LINE : `${BY_MESSAGE_LINE} ${tooNew} sent since ${tooNew === 1 ? "is" : "are"} not counted yet.`;
export function messageRateWords(m) {
  if (m.mature === 0) return `${m.sent} sent in the last ${REPLY_DAYS}, too new to say`;
  const said = messagesAnsweredWords(m.replied, m.mature);
  return isThinShare(m.mature, REPORT_MIN_N) ? said : `${said}  ${pct(m.replied, m.mature)}%`;
}
export function runsLineWords(moment, broadcast) {
  const kinds = [
    moment > 0 ? plural(moment, "campaign run") : null,
    broadcast > 0 ? plural(broadcast, "one-off broadcast") : null
  ].filter((kind) => kind !== null);
  return kinds.length === 0 ? null : `From ${joinWords(kinds)}.`;
}
export const FIRST_REPLY_EMPTY = "No message was answered in this period.";
export const FIRST_REPLY_ROWS = [
  ["m15", "Within 15 minutes"],
  ["h1", "Within an hour"],
  ["h4", "Within 4 hours"],
  ["h24", "Within a day"],
  ["h72", `Within ${REPLY_DAYS}`]
];
export const APPROVAL_EMPTY = "No run waited for your OK in this period.";
export const APPROVAL_ROWS = [
  ["h1", "An hour or less"],
  ["h4", "Up to 4 hours"],
  ["h24", "Up to a day"],
  ["over", "More than a day"]
];
export function firstReplyLine(n, medianS) {
  if (n < REPORT_MIN_N)
    return `${plural(n, "message")} ${n === 1 ? "has" : "have"} been answered so far: too few for a middle.`;
  if (medianS === null) return null;
  return `The middle one was answered ${durationWords(medianS)} after it was sent, of ${plural(n, "answered message")}.`;
}
export function approvalLine(n, medianS) {
  if (n < REPORT_MIN_N) return `${plural(n, "run")} you approved: too few for a middle.`;
  if (medianS === null) return null;
  return `The middle wait for your OK was ${durationWords(medianS)}, over ${plural(n, "run")} you approved.`;
}
export function runsWaitingMeta(n, late) {
  if (n === 0) return "nothing is waiting for your OK";
  const one = n === 1;
  if (late === 0) return one ? "it can still be approved" : "they can still be approved";
  if (late >= n) return one ? "it is past its day: skip it" : "they are past their day: skip them";
  return `${late} past their day (skip those), ${n - late} can still be approved`;
}
const RUNS_FAILED_NONE = `no run failed in the last ${STUCK_DAYS}`;
const REACH_OUT_STEP_COUNTS = "a reach-out's step counts too";
export function failedRunMeta(failed) {
  if (failed.n === 0) return RUNS_FAILED_NONE;
  const what = failed.latest === null ? `${plural(failed.n, "run")} failed in the last ${STUCK_DAYS}` : `the latest: ${failed.latest.name}, ${broadcastFailureWords(failed.latest.failure)}`;
  return `${what} \xB7 ${REACH_OUT_STEP_COUNTS}`;
}
export const REPLIES_NONE = "nobody who answered a campaign is waiting";
export const REPLIES_WAITING = `people who answered a campaign in the last ${STUCK_DAYS} and wait for a person`;
const TEMPLATES_NONE = "every WhatsApp message is approved";
const TEMPLATES_TITLED = 2;
export function templatesMeta(templates) {
  if (templates.n === 0) return TEMPLATES_NONE;
  return templates.items.slice(0, TEMPLATES_TITLED).map((t) => `${templateTitle(t.name)} ${TEMPLATE_STATUS_WORDS[t.status].toLowerCase()}`).join(", ");
}
export const NUMBER_HEALTH_WORDS = { ok: "Good", warn: "Medium", danger: "Flagged", unknown: "Not reported" };
export const NUMBER_HEALTH_TONES = {
  ok: {},
  warn: { tone: "warn" },
  danger: { tone: "fail" },
  unknown: {}
};
export const NUMBER_NONE = "no WhatsApp number is connected";
export const NUMBER_UNREAD = "this number could not be read";
export function numberMeta(number, tz, nowMs) {
  const at = number.checked_at === null ? NaN : Date.parse(number.checked_at);
  return Number.isNaN(at) ? number.label : `${number.label} \xB7 checked ${clockNear(at, tz, nowMs)}`;
}
export const FAILED_WHAT = {
  campaigns: "the campaign numbers",
  ledger: "who it reached and what is stuck",
  stuck: "what is stuck now",
  reach_outs: "the reach-out numbers"
};
const STILL_READ = {
  campaigns: "the sends and their channels",
  ledger: "who it reached",
  stuck: "what is stuck now",
  reach_outs: "the reach-outs"
};
export const REST_IS_CURRENT = "The rest of this page is current.";
export const NOTHING_ELSE_READ = "Nothing else on this page could be read either.";
export const onlyReadWords = (landed) => `Only ${joinWords(landed.map((part) => STILL_READ[part]))} could be read.`;
