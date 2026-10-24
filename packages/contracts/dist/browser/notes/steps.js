import { clockDate, clockNear, wallClockAt, zoneDayKey } from "../shared/clock.js";
import { isRealDate } from "../config/workspace-config/config-rules.js";
export function stepDayOf(day, tz, nowMs) {
  if (!day || !isRealDate(day)) return null;
  const at = wallClockAt(tz, day, 12, 0);
  if (!Number.isFinite(at)) return null;
  const today = zoneDayKey(nowMs, tz);
  const due = day < today ? "past" : day === today ? "today" : "ahead";
  const near = clockNear(at, tz, nowMs);
  return { day, due, near, words: due === "past" ? `Overdue since ${near}` : `Due ${near}` };
}
export function stepIsDue(step) {
  return !!step && step.due !== "ahead";
}
export function dueStepDay(step, tz, nowMs) {
  const day = step ? stepDayOf(step.day.day, tz, nowMs) : null;
  return stepIsDue(day) ? day : null;
}
export function forWords(forMe, forUserId, forName) {
  if (forMe) return "For you";
  const name = (forName ?? "").trim();
  return forUserId && name ? `For ${name}` : null;
}
export function nextStepOf(r, tz, nowMs) {
  const words = r.step_body?.trim();
  if (!r.step_id || !words) return null;
  const day = stepDayOf(r.step_due_on, tz, nowMs);
  if (!day) return null;
  return {
    id: r.step_id,
    words,
    day,
    due: day.due,
    forWho: forWords(r.step_for_me, r.step_for_user_id, r.step_for_name),
    forMe: !!r.step_for_me,
    forUserId: r.step_for_user_id ?? null,
    dealId: r.step_deal_id ?? null
  };
}
function dayPlus(key, n) {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)) + n)).toISOString().slice(0, 10);
}
function weekdayOf(key) {
  return new Date(Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)))).getUTCDay();
}
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function stepDays(nowMs, tz) {
  const today = zoneDayKey(nowMs, tz);
  const wd = weekdayOf(today);
  const out = [];
  const add = (key, label) => {
    if (out.some((c) => c.key === key)) return;
    const long = WEEKDAYS[weekdayOf(key)];
    out.push({ key, label, title: `${long}, ${clockDate(wallClockAt(tz, key, 12, 0), tz, nowMs)}` });
  };
  add(today, "Today");
  add(dayPlus(today, 1), "Tomorrow");
  const toFriday = wd >= 1 && wd <= 5 ? 5 - wd : -1;
  for (let i = 2; i <= toFriday; i++) add(dayPlus(today, i), WEEKDAYS[weekdayOf(dayPlus(today, i))].slice(0, 3));
  add(dayPlus(today, wd === 0 ? 1 : 8 - wd), "Next week");
  out.push({ key: "pick", label: "Pick a day", title: "Choose any day" });
  return out;
}
export function callDays(nowMs, tz) {
  const all = stepDays(nowMs, tz);
  const tomorrow = all.find((c) => c.label === "Tomorrow");
  const friday = all.find((c) => c.label === WEEKDAYS[5].slice(0, 3));
  const nextWeek = all.find((c) => c.label === "Next week");
  const pick = all.find((c) => c.key === "pick");
  return [tomorrow, friday ?? nextWeek, pick].filter((c) => !!c);
}
export function composerDays(nowMs, tz) {
  const today = stepDays(nowMs, tz).find((c) => c.label === "Today");
  return [...today ? [today] : [], ...callDays(nowMs, tz)];
}
export function stepDayName(key, nowMs, tz) {
  const offered = stepDays(nowMs, tz).find((c) => c.key === key && c.key !== "pick");
  if (offered) return offered.label === "Next week" ? "next week" : offered.label;
  return clockDate(wallClockAt(tz, key, 12, 0), tz, nowMs);
}
export const TODAY_STEPS_MAX = 3;
export function todayStepsDue(rows, nowMs, tz, max = TODAY_STEPS_MAX) {
  const due = rows.map((row) => {
    const s = row.nextStep;
    const day = dueStepDay(s, tz, nowMs);
    return s && day ? { row, step: { ...s, day, due: day.due } } : null;
  }).filter((x) => x !== null).sort((a, b) => a.step.day.day.localeCompare(b.step.day.day) || a.row.name.localeCompare(b.row.name));
  return { rows: due.slice(0, Math.max(0, max)), count: due.length };
}
