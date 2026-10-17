import { standingOfThread } from "../../conversations/standing.js";
export const MISSED_CALL_TOUCH_WORDS = "an hour";
const OPEN_ESCALATIONS_LISTED = 500;
const isObjectAnswer = (v) => typeof v === "object" && v !== null;
export function isReceptionistSeriesDto(answer) {
  return isObjectAnswer(answer) && typeof answer.timezone === "string" && typeof answer.today === "string" && typeof answer.days === "number" && isObjectAnswer(answer.hold) && isObjectAnswer(answer.handover) && isObjectAnswer(answer.stuck) && Array.isArray(answer.stuck.open);
}
function windowEcho(h) {
  return { timezone: h.timezone, today: h.today, ...h.end === void 0 ? {} : { end: h.end }, days: h.days };
}
function stuckOf(open, nowMs) {
  const needsYou = (o) => standingOfThread(
    { state: o.state, paused_until: o.paused_until, assignee_user_id: o.assignee_user_id },
    // The hold itself: one that waits on nobody (a STOP, opened before decision 0048) is no wait.
    o,
    nowMs
  ).standing === "needs_you";
  const waiting = open.filter(needsYou);
  const oldest = waiting.reduce(
    (first, o) => first === null || Date.parse(o.created_at) < Date.parse(first) ? o.created_at : first,
    null
  );
  return {
    waiting: waiting.length,
    oldest_at: oldest,
    callbacks: waiting.filter((o) => o.reason === "callback").length,
    capped: open.length >= OPEN_ESCALATIONS_LISTED
  };
}
export function receptionistDtoOf(series, parts) {
  if (series === null) return { ...windowEcho(parts.head), series: null, profile: parts.profile };
  const { links, stuck, ...rest } = series;
  return {
    ...windowEcho(series),
    series: {
      ...rest,
      links: { sent: links.total, booked: parts.booked?.booked ?? null, calendar: parts.booked?.calendar ?? "none" },
      stuck: stuckOf(stuck.open, parts.nowMs)
    },
    profile: parts.profile
  };
}
