import { shiftKey, zoneMidnight } from "../calendar/day-keys.js";
import { appointmentWords } from "../journey/appointment-word.js";
import { PLAYBOOK_HOURS, PLAYBOOK_VETO_DELAY_MS, SENDING_HOURS_END, triggerOf } from "./playbook-triggers.js";
import { clockDate, clockHour } from "../shared/clock.js";
import { dateFormat, HOUR_MS } from "../shared/time.js";
export function campaignEnded(p, day) {
  return p.until && day > p.until ? p.until : null;
}
export function campaignRunsOn(p, at) {
  if (p.state !== "running") return false;
  return !campaignEnded(p, localDate(at.tz, at.now));
}
export function campaignDayWords(day, tz, now) {
  return clockDate(zoneMidnight(tz, day) + 12 * HOUR_MS, tz, now.getTime());
}
export function planRun(mode, now) {
  if (mode === "auto") return { kind: "send", state: "scheduled", at: now };
  if (mode === "veto")
    return { kind: "send", state: "scheduled", at: new Date(now.getTime() + PLAYBOOK_VETO_DELAY_MS) };
  return { kind: "hold", state: "pending_approval" };
}
function parts(tz, now) {
  try {
    const f = dateFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false
    });
    const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
    const hour = Number(p.hour) % 24;
    return { date: `${p.year}-${p.month}-${p.day}`, hour };
  } catch {
    return { date: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
  }
}
export function localDate(tz, now) {
  return parts(tz, now).date;
}
export function localHour(tz, now) {
  return parts(tz, now).hour;
}
export function nextOpenMoment(tz, when) {
  const { date, hour } = parts(tz, when);
  if (hour >= PLAYBOOK_HOURS.min && hour <= PLAYBOOK_HOURS.max) return { at: when, moved: false };
  const day = hour < PLAYBOOK_HOURS.min ? date : shiftKey(date, 1);
  let at = zoneMidnight(tz, day) + PLAYBOOK_HOURS.min * HOUR_MS;
  const landed = parts(tz, new Date(at)).hour;
  if (landed !== PLAYBOOK_HOURS.min) at += (PLAYBOOK_HOURS.min - landed) * HOUR_MS;
  return { at: new Date(at), moved: true };
}
export function sendingEndsAt(tz, now) {
  const { date, hour } = parts(tz, now);
  if (hour > PLAYBOOK_HOURS.max) return null;
  const end = SENDING_HOURS_END;
  let at = zoneMidnight(tz, date) + end * HOUR_MS;
  const landed = parts(tz, new Date(at)).hour;
  if (landed !== end) at += (end - landed) * HOUR_MS;
  return new Date(at);
}
export function runDueNow(p, tz, now) {
  if (p.state !== "running") return false;
  const { date, hour } = parts(tz, now);
  return hour >= p.run_hour && hour <= PLAYBOOK_HOURS.max && p.last_run_for !== date;
}
export function inLastSendingHour(tz, now) {
  return parts(tz, now).hour >= PLAYBOOK_HOURS.max;
}
export function scheduleLine(p, word) {
  const at = clockHour(p.run_hour);
  if (triggerOf(p.trigger)?.kind === "visit") {
    const W = appointmentWords(word);
    return `Daily ${at} \xB7 ${p.trigger === "visit_tomorrow" ? W.tomorrowWho : W.yesterdayWho} \xB7 up to ${p.cap_per_run}`;
  }
  if (p.trigger === "everyone_monthly") return `Every ${p.cadence_days} days at ${at} \xB7 up to ${p.cap_per_run} a day`;
  if (triggerOf(p.trigger)?.kind === "deal") return `Daily ${at} \xB7 up to ${p.cap_per_run} \xB7 once per proposal`;
  return `Daily ${at} \xB7 up to ${p.cap_per_run} \xB7 once per person, again after ${p.gap_days} days`;
}
export function runsWords(p) {
  const at = clockHour(p.run_hour);
  return p.trigger === "everyone_monthly" ? `runs every ${p.cadence_days} days at ${at}` : `runs daily at ${at}`;
}
const NEXT_RUN_WORKSPACE_PAUSED = "after billing resumes";
const NEXT_RUN_PAST_LAST_DAY = "none: its last day has passed";
export function nextRunLabel(p, tz, now, workspacePaused) {
  if (p.state !== "running") return "paused";
  if (workspacePaused) return NEXT_RUN_WORKSPACE_PAUSED;
  const next = nextRunOf(p, tz, now);
  const today = localDate(tz, now);
  if (campaignEnded(p, next.day === "today" ? today : shiftKey(today, 1))) return NEXT_RUN_PAST_LAST_DAY;
  return next.soon ? "today, within the hour" : `${next.day} ${clockHour(next.hour)}`;
}
export function nextRunOf(p, tz, now) {
  const { date, hour } = parts(tz, now);
  if (p.last_run_for !== date) {
    if (hour < p.run_hour) return { day: "today", hour: p.run_hour, soon: false };
    if (hour <= PLAYBOOK_HOURS.max) return { day: "today", hour: p.run_hour, soon: true };
  }
  return { day: "tomorrow", hour: p.run_hour, soon: false };
}
