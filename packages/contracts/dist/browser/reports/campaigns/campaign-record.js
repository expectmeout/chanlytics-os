import { standingOfThread } from "../../conversations/standing.js";
import { runApprovalRefusal } from "../../playbooks/playbook-approval.js";
import { nextOpenMoment } from "../../playbooks/playbook-schedule.js";
import { zoneDayKey } from "../../shared/clock.js";
import { isCount, recordOrNull } from "../../shared/unknown.js";
const CAMPAIGN_ROWS_LISTED = 500;
const TEMPLATES_NAMED = 3;
const valueAt = (from, path) => path.reduce((at, key) => recordOrNull(at)?.[key], from);
const isObjectAt = (from, path) => recordOrNull(valueAt(from, path)) !== null;
function isRowsAt(from, path) {
  const rows = valueAt(from, path);
  return Array.isArray(rows) && rows.every((row) => recordOrNull(row) !== null);
}
const SERIES_OBJECTS = [
  ["people", "now"],
  ["people", "before"],
  ["runs", "now"],
  ["runs", "before"],
  ["held", "by_reason"],
  ["stopped", "by_failure"],
  ["first_reply", "buckets"],
  ["approval", "buckets"]
];
const SERIES_LISTS = [["failed_sends", "by_code"], ["by_message"]];
export function isCampaignLedgerSeriesDto(answer) {
  const a = recordOrNull(answer);
  return a !== null && typeof a.timezone === "string" && typeof a.today === "string" && (a.end === void 0 || typeof a.end === "string") && isCount(a.days) && SERIES_OBJECTS.every((path) => isObjectAt(a, path)) && SERIES_LISTS.every((path) => isRowsAt(a, path));
}
const STUCK_LISTS = ["runs_waiting", "runs_failed", "replies", "templates"];
export function isCampaignStuckRawDto(answer) {
  const a = recordOrNull(answer);
  return a !== null && STUCK_LISTS.every((key) => isRowsAt(a, [key]));
}
function oldestInstant(instants) {
  return instants.reduce((first, at) => {
    if (Number.isNaN(Date.parse(at))) return first;
    return first === null || Date.parse(at) < Date.parse(first) ? at : first;
  }, null);
}
function runsWaitingOf(runs, at) {
  const days = {
    today: zoneDayKey(at.nowMs, at.tz),
    sendsOn: zoneDayKey(nextOpenMoment(at.tz, new Date(at.nowMs)).at.getTime(), at.tz)
  };
  const late = runs.filter(
    (r) => runApprovalRefusal(
      { playbook_id: r.playbook_id, run_for: r.run_for, audience: { kind: r.audience_kind, trigger: r.trigger } },
      days
    ) !== null
  );
  return {
    n: runs.length,
    late: late.length,
    oldest_at: oldestInstant(runs.map((r) => r.created_at)),
    capped: runs.length >= CAMPAIGN_ROWS_LISTED
  };
}
function runsFailedOf(runs) {
  const latest = runs.reduce((top, run) => {
    if (Number.isNaN(Date.parse(run.finished_at))) return top;
    return top === null || Date.parse(run.finished_at) > Date.parse(top.finished_at) ? run : top;
  }, null);
  return {
    n: runs.length,
    latest: latest === null ? null : { name: latest.name, failure: latest.failure, at: latest.finished_at },
    capped: runs.length >= CAMPAIGN_ROWS_LISTED
  };
}
function repliesWaitingOf(replies, nowMs) {
  const waiting = replies.filter(
    (r) => standingOfThread(
      { state: r.state, paused_until: r.paused_until, assignee_user_id: r.assignee_user_id },
      // The hold itself where the database says what it is for: one that waits on nobody (a STOP) is no wait.
      r.open_escalation ? { reason: r.open_escalation_reason } : false,
      nowMs
    ).standing === "needs_you"
  );
  return {
    n: waiting.length,
    oldest_at: oldestInstant(waiting.map((r) => r.replied_at)),
    capped: replies.length >= CAMPAIGN_ROWS_LISTED
  };
}
function templatesStoppedOf(templates) {
  return {
    n: templates.length,
    items: templates.slice(0, TEMPLATES_NAMED).map((t) => ({ name: t.name, language: t.language, status: t.status }))
  };
}
export function campaignLedgerDtoOf(series, parts) {
  const asked = series ?? parts.head;
  const at = { tz: asked.timezone, nowMs: parts.nowMs };
  const failed = parts.stuckFailed ? { stuck_failed: true } : {};
  return {
    timezone: asked.timezone,
    today: asked.today,
    ...asked.end === void 0 ? {} : { end: asked.end },
    days: asked.days,
    series,
    stuck: parts.stuck === null || parts.stuckFailed ? null : {
      waiting: runsWaitingOf(parts.stuck.runs_waiting, at),
      failed: runsFailedOf(parts.stuck.runs_failed),
      replies: repliesWaitingOf(parts.stuck.replies, at.nowMs),
      templates: templatesStoppedOf(parts.stuck.templates),
      number: parts.number
    },
    ...failed
  };
}
