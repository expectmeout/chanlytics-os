import { MIN_MS } from "../shared/time.js";
import { RUN_WAITING_WORDS } from "../shell/campaign-rooms.js";
import { isCount, recordOrNull } from "../shared/unknown.js";
import { templateTitle } from "../templates/template-titles.js";
import { clockDate, clockWhen } from "../shared/clock.js";
import { noNumberWords } from "../people/people-lists.js";
import { consentGuardWords } from "../consent/consent-asks.js";
import { CONSENT_CHANNELS, countsByChannelWords } from "../consent/consent-channels.js";
import { broadcastFailureWords } from "./broadcast-failures.js";
import { answeredYes } from "./reach-any.js";
import { channelRefuses } from "./reach-for.js";
export {
  AUDIENCE_KINDS,
  EVERYONE_LABEL,
  EVERYONE_HINT,
  UNKNOWN_AUDIENCE_WORDS,
  CONSENT_LIST_IDS,
  doorNamesNoAudience,
  eligibleFor,
  enrolFor,
  saidYesOnAny,
  heldWords,
  heldBackWords,
  audienceMembers,
  audiencePreview,
  audienceTrigger
} from "./broadcast-audience.js";
export {
  DEFAULT_CAMPAIGN_CHANNELS,
  NEW_PLAYBOOK_TICKS_EVERY_CHANNEL,
  newCampaignChannels,
  CHANNEL_WORDS,
  CAMPAIGN_MONTH_ALLOWANCE,
  HELD_ON,
  channelRefuses,
  channelNeverCarries,
  offersNote,
  channelsReady,
  channelChoices,
  reachFor,
  reachSplit,
  reachSplitWords,
  heldByAllowance,
  allowanceRoom,
  pastAllowance,
  nextMonthStart,
  monthSentAt,
  allowanceBeforeSend,
  allowanceLine,
  allowanceLines
} from "./reach-for.js";
export {
  BROADCAST_FAILURES,
  BROADCAST_FAILURE_WORDS,
  BROADCAST_FAILURE_FIX,
  broadcastFailureFix,
  broadcastFailureWords,
  emailRunStop,
  playbookRunNext,
  stoppedRunFix,
  wireFailure
} from "./broadcast-failures.js";
export { LIMIT_TIERS, dailyLimit, numberHealth, overLimitRefusal } from "./broadcast-number.js";
export { RUN_REPORT_STEPS, RUN_FILTERS, consentAnswerWords, receiptWords, toRunReportVM } from "./run-report.js";
export const BROADCAST_STATES = ["pending_approval", "scheduled", "sending", "sent", "canceled", "failed"];
export const RUN_GOING_STATES = ["scheduled", "sending"];
export const RECIPIENT_STATES = ["queued", "sent", "skipped", "failed"];
export const REACH_OUT_SEND_STATES = [
  "planned",
  "held",
  "claimed",
  "queued",
  "drafted",
  "sent",
  "skipped",
  "failed",
  "handed"
];
export const BROADCAST_STATE_LABELS = {
  pending_approval: RUN_WAITING_WORDS,
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  canceled: "Canceled",
  failed: "Failed"
};
export const BROADCAST_CHUNK = 25;
export const BROADCAST_GAP_MS = 300;
export const BROADCAST_THROTTLE_WAITS_MS = [
  MIN_MS,
  2 * MIN_MS,
  5 * MIN_MS,
  10 * MIN_MS,
  15 * MIN_MS,
  30 * MIN_MS
];
export const BROADCAST_HOLD_WAIT_MS = 10 * MIN_MS;
export const BROADCAST_MAX_RECIPIENTS = 2e3;
export const BROADCAST_PARAM_MAX = 1024;
export const BROADCAST_SCHEDULE_MAX_DAYS = 30;
export const BROADCAST_NAME_MAX = 80;
export {
  REPLY_WINDOW_HOURS,
  REPLY_WINDOW_MS,
  REPLY_WINDOW_WORDS,
  runStillMoving,
  RECIPIENT_REASON_HEARD,
  LEFT_OUT_FACTS,
  leftOutByFacts,
  leftOutBy,
  heardWithin,
  breathTouchOf,
  heardFor,
  breathSplit,
  reachAfterBreath,
  heardWords,
  heardTooWords,
  allLeftOutWords,
  breathWaitWords,
  BREATH_WHY,
  HEARD_UNREAD_WORDS,
  goesToOf,
  HELD_REASONS,
  HELD_WHEN_COUNTED,
  DELIVERY_RECEIPTS_TIP,
  DELIVERY_RECEIPTS_WORDS,
  finishedRunHeldWhy,
  isReplyTo
} from "./run-words.js";
export function renderTemplate(body, params) {
  return String(body ?? "").replace(/\{\{(\d+)\}\}/g, (m, n) => {
    const v = params[Number(n) - 1];
    return typeof v === "string" && v !== "" ? v : m;
  });
}
export function cleanParam(raw) {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > BROADCAST_PARAM_MAX) return null;
  if (/[\n\r\t]/.test(v) || /\s{4,}/.test(v)) return null;
  return v;
}
export function broadcastName(templateName, tz, now = /* @__PURE__ */ new Date(), title) {
  const day = clockDate(now.getTime(), tz, now.getTime());
  return `${templateTitle(templateName, title)} \xB7 ${day}`.slice(0, BROADCAST_NAME_MAX);
}
const RUN_COUNTED = ["queued", "sent", "skipped", "failed", "delivered", "read", "replied"];
export function runCountsOf(answer) {
  const byRun = recordOrNull(answer);
  if (!byRun) return null;
  const out = {};
  for (const [id, raw] of Object.entries(byRun)) {
    const c = recordOrNull(raw);
    const by = recordOrNull(c?.sent_by);
    if (!c || !by) return null;
    const counts = { queued: 0, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 };
    for (const k of RUN_COUNTED) {
      const n = c[k];
      if (!isCount(n)) return null;
      counts[k] = n;
    }
    const { whatsapp, sms, email } = by;
    if (!isCount(whatsapp) || !isCount(sms) || !isCount(email)) return null;
    out[id] = { ...counts, sent_by: { whatsapp, sms, email } };
  }
  return out;
}
export function runTitleOf(run) {
  const tail = run.run_for ? ` \xB7 ${run.run_for}` : null;
  return tail && run.name.endsWith(tail) && run.name.length > tail.length ? run.name.slice(0, -tail.length) : run.name;
}
export function whenLabel(iso, tz, now = /* @__PURE__ */ new Date()) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? clockWhen(ms, tz, now.getTime()) : "";
}
function readShare(c) {
  const of = c.sent_by ? c.sent_by.whatsapp : c.sent;
  return of > 0 ? Math.round(c.read / of * 100) : null;
}
export function sentByWords(by) {
  return countsByChannelWords(by);
}
export function toBroadcastVM(d, tz, now = /* @__PURE__ */ new Date()) {
  const c = d.counts;
  const attempted = c.sent + c.skipped + c.failed;
  return {
    ...d,
    stateLabel: BROADCAST_STATE_LABELS[d.state] ?? d.state,
    when: whenLabel(d.finished_at ?? d.started_at ?? d.scheduled_for, tz, now),
    deliveredPct: c.sent > 0 ? Math.round(c.delivered / c.sent * 100) : null,
    readPct: readShare(c),
    open: d.state === "scheduled" || d.state === "sending" || d.state === "pending_approval",
    progress: d.recipient_count > 0 ? Math.min(1, attempted / d.recipient_count) : 0,
    failureLabel: d.state === "failed" ? broadcastFailureWords(d.failure) : null
  };
}
export const OUTCOME_UNKNOWN = "outcome_unknown";
export function emptyAudienceRefusal(purpose, label, pool, how) {
  const ticked = CONSENT_CHANNELS.filter((c) => how.channels.includes(c));
  const ready = how.ready;
  if (ready) {
    const refused = ticked.map((c) => channelRefuses(c, purpose, how.about, ready));
    const first = refused[0];
    if (first && refused.every((why) => why !== null)) return `Nobody on \u201C${label}\u201D can be sent this: ${first}`;
  }
  if (ticked.includes("email"))
    return `Nobody on \u201C${label}\u201D can be sent this yet. ${consentGuardWords(ticked, purpose, how.about).join(" ")}`;
  if (pool.some((r) => answeredYes(r, purpose))) return noNumberWords(`\u201C${label}\u201D`, purpose);
  return purpose === "marketing" ? "Nobody there has said yes to offers yet \u2014 that is a separate answer from saying yes to messages, and only it puts somebody on a promotional broadcast. Record it under \u201COffers and news\u201D on a person's profile, or get their yes with the phrase and the QR in Sent." : "Nobody there has said yes to messages yet. Even a reminder needs their recorded yes. Record it on a person's profile, or get their yes with the phrase and the QR in Sent.";
}
