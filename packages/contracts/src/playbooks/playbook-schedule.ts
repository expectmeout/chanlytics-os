/**
 * When a playbook runs: the run plan, the workspace's local day and hour, the next open moment, and the schedule's
 * words. Moved whole from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import { shiftKey, zoneMidnight } from "../calendar/day-keys";
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import { PLAYBOOK_HOURS, PLAYBOOK_VETO_DELAY_MS, triggerOf } from "./playbook-triggers";
import type { PlaybookDto } from "./playbooks";
import { clockDate, clockHour } from "../shared/clock";
import { dateFormat, HOUR_MS, WEEK_MS } from "../shared/time";

export type RunPlan =
  { kind: "send"; state: "scheduled"; at: Date } | { kind: "hold"; state: "pending_approval" } | { kind: "off" };

/**
 * Whether a campaign runs on trial at `now` (00409 `trial_until`): before that instant, a run its class would send by
 * itself waits for a person. No trial, one that is over, and a value that is no instant are none.
 */
function onTrialAt(p: { trial_until?: string | null }, now: Date): boolean {
  const end = Date.parse(p.trial_until ?? "");
  return Number.isFinite(end) && now.getTime() < end;
}

/**
 * The mode a run of a campaign goes under: its class's, but auto waits for a person as veto does while the campaign is
 * on trial (onTrialAt). Every other mode is its own. What core run-playbook plans and tells a run by, and records.
 */
export function effectiveMode<M extends string>(p: { trial_until?: string | null }, mode: M, now: Date): M | "veto" {
  return mode === "auto" && onTrialAt(p, now) ? "veto" : mode;
}

/**
 * Until when a new campaign that starts on trial runs on it (D5 of the 10 October 2026 spec): a week from `now`, the
 * moment it is approved (POST playbooks with `trial: true`, at the route's own clock), never the moment its card was
 * made. For those seven days each run its class would send by itself waits for a Stop, as veto's does (effectiveMode).
 * Ask's card asks for a trial under an auto class only; the composer's own campaigns start on none.
 */
export function newCampaignTrialUntil(now: Date): string {
  return new Date(now.getTime() + WEEK_MS).toISOString();
}

/**
 * A campaign's last day (00409 `until`, YYYY-MM-DD by the business's clock) where `day`, the business's day, is past it:
 * it has ended, and a run on such a day sends nothing (core run-playbook's `ended`). Null where it has no end, or `day`
 * is its last or before.
 */
export function campaignEnded(p: { until?: string | null }, day: string): string | null {
  return p.until && day > p.until ? p.until : null;
}

/** A campaign's day as its words say it, by the business's calendar: "Nov 30", and "Jan 4, 2027" in another year. */
export function campaignDayWords(day: string, tz: string, now: Date): string {
  return clockDate(zoneMidnight(tz, day) + 12 * HOUR_MS, tz, now.getTime());
}

/** The day a campaign's trial ends, as its words say it ("Oct 18"), while it is on trial at `now`; null otherwise. */
export function trialDayWords(p: { trial_until?: string | null }, tz: string, now: Date): string | null {
  return onTrialAt(p, now) ? clockDate(Date.parse(p.trial_until ?? ""), tz, now.getTime()) : null;
}

/** What a run does under the class's mode: sends now, sends after a stop window, waits for a person, or nothing. */
export function planRun(mode: string | null | undefined, now: Date): RunPlan {
  switch (mode) {
    case "auto":
      return { kind: "send", state: "scheduled", at: now };
    case "veto":
      return { kind: "send", state: "scheduled", at: new Date(now.getTime() + PLAYBOOK_VETO_DELAY_MS) };
    case "ask":
      return { kind: "hold", state: "pending_approval" };
    default:
      return { kind: "off" };
  }
}

function parts(tz: string, now: Date): { date: string; hour: number } {
  try {
    const f = dateFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
    const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
    const hour = Number(p.hour) % 24;
    return { date: `${p.year}-${p.month}-${p.day}`, hour };
  } catch {
    return { date: now.toISOString().slice(0, 10), hour: now.getUTCHours() };
  }
}

/** YYYY-MM-DD by the business's clock. */
export function localDate(tz: string, now: Date): string {
  return parts(tz, now).date;
}

export function localHour(tz: string, now: Date): number {
  return parts(tz, now).hour;
}

/**
 * The next moment a message may go out, by the business's clock: `when`
 * itself when it falls inside PLAYBOOK_HOURS (nine to the twenty-hundred
 * hour), nine that morning when it is earlier, nine the next morning when it
 * is later. The same window the playbooks keep, applied to a broadcast and to
 * a run somebody approves at night: a send asked for at 3 AM lands at nine,
 * and the receipt says it moved. Zone-aware through zoneMidnight, so the
 * night a clock changes still yields nine o'clock.
 */
export function nextOpenMoment(tz: string, when: Date): { at: Date; moved: boolean } {
  const { date, hour } = parts(tz, when);
  if (hour >= PLAYBOOK_HOURS.min && hour <= PLAYBOOK_HOURS.max) return { at: when, moved: false };
  const day = hour < PLAYBOOK_HOURS.min ? date : shiftKey(date, 1);
  // Nine hours past midnight is not nine o'clock on the day the clocks change:
  // the offset at nine is what counts, so the guess is read back and corrected
  // by however far its hour landed from nine.
  let at = zoneMidnight(tz, day) + PLAYBOOK_HOURS.min * HOUR_MS;
  const landed = parts(tz, new Date(at)).hour;
  if (landed !== PLAYBOOK_HOURS.min) at += (PLAYBOOK_HOURS.min - landed) * HOUR_MS;
  return { at: new Date(at), moved: true };
}

/**
 * A running playbook runs once per local day: at its hour, or later that day
 * when the sweep missed the hour or the playbook was started or resumed
 * after it — never past the last hour a message may go out.
 */
export function runDueNow(p: Pick<PlaybookDto, "state" | "run_hour" | "last_run_for">, tz: string, now: Date): boolean {
  if (p.state !== "running") return false;
  const { date, hour } = parts(tz, now);
  return hour >= p.run_hour && hour <= PLAYBOOK_HOURS.max && p.last_run_for !== date;
}

/**
 * Whether this is the last hour a playbook's day is still asked for (`runDueNow` stops after PLAYBOOK_HOURS.max): a
 * run that fails now is the day's last chance, and tomorrow's run is the next try.
 */
export function inLastSendingHour(tz: string, now: Date): boolean {
  return parts(tz, now).hour >= PLAYBOOK_HOURS.max;
}

/**
 * "Daily 10:00 AM · up to 25 · once per person, again after 90 days". The hour is said by the product's clock
 * (shared/clock.ts clockHour), as a broadcast's time is: it said "10:00" and "18:00" beside "6:00 PM" until 8 Oct 2026. An
 * appointment moment's says who in the workspace's word (contracts appointmentWords).
 */
export function scheduleLine(
  p: Pick<PlaybookDto, "trigger" | "run_hour" | "cap_per_run" | "gap_days" | "cadence_days">,
  word: AppointmentWord,
): string {
  const at = clockHour(p.run_hour);
  if (triggerOf(p.trigger)?.kind === "visit") {
    const W = appointmentWords(word);
    return `Daily ${at} · ${p.trigger === "visit_tomorrow" ? W.tomorrowWho : W.yesterdayWho} · up to ${p.cap_per_run}`;
  }
  if (p.trigger === "everyone_monthly") return `Every ${p.cadence_days} days at ${at} · up to ${p.cap_per_run} a day`;
  // One follow-up per proposal (0006): no gap to wait out.
  if (triggerOf(p.trigger)?.kind === "deal") return `Daily ${at} · up to ${p.cap_per_run} · once per proposal`;
  return `Daily ${at} · up to ${p.cap_per_run} · once per person, again after ${p.gap_days} days`;
}

/**
 * A playbook's clock in the fewest words -- "runs daily at 10:00 AM", "runs every
 * 30 days at 10:00 AM" -- for a line under something that names it, where
 * `scheduleLine`'s cap and gap would be a sentence too many.
 */
// The trigger is compared, never narrowed, so a row read from the table (a plain string) will do.
export function runsWords(p: { trigger: string; run_hour: number; cadence_days: number }): string {
  const at = clockHour(p.run_hour);
  return p.trigger === "everyone_monthly" ? `runs every ${p.cadence_days} days at ${at}` : `runs daily at ${at}`;
}

/**
 * What a running playbook's next run says while the WORKSPACE is paused (billing): no time is promised, since the send door
 * refuses every message of a run until billing resumes (core deliver.ts `paused`), and a card that said "tomorrow 10:00 AM" said
 * what would not happen.
 */
const NEXT_RUN_WORKSPACE_PAUSED = "after billing resumes";

/**
 * "today 10:00 AM", "today, within the hour" or "tomorrow 10:00 AM", by the business's clock; "paused" when the playbook is, and
 * "after billing resumes" while the workspace is (`workspacePaused`, the readiness the surface reads: contracts
 * ChannelsReady.paused). Required: a caller that does not know says so rather than promise a run.
 */
export function nextRunLabel(
  p: Pick<PlaybookDto, "state" | "run_hour" | "last_run_for">,
  tz: string,
  now: Date,
  workspacePaused: boolean,
): string {
  if (p.state !== "running") return "paused";
  if (workspacePaused) return NEXT_RUN_WORKSPACE_PAUSED;
  const next = nextRunOf(p, tz, now);
  return next.soon ? "today, within the hour" : `${next.day} ${clockHour(next.hour)}`;
}

/**
 * When a running playbook next runs, as a fact, by the business's clock: the day it falls on, its hour, and `soon`
 * where its hour has come and today's run is not made yet (the clock's next tick makes it: "within the hour"). Today at
 * its hour while that is ahead; today and soon once the hour has come, the sending hours are still open and today's run
 * has not been made; tomorrow at its hour otherwise. THE rule, which the card's label (nextRunLabel) and Coming up's
 * line (lifecycle-tiles.ts) are both said from. The line used to parse the label's words back into a time, and a label
 * it could not read dropped the moment from the week without a trace.
 */
export function nextRunOf(
  p: Pick<PlaybookDto, "run_hour" | "last_run_for">,
  tz: string,
  now: Date,
): { day: "today" | "tomorrow"; hour: number; soon: boolean } {
  const { date, hour } = parts(tz, now);
  if (p.last_run_for !== date) {
    if (hour < p.run_hour) return { day: "today", hour: p.run_hour, soon: false };
    if (hour <= PLAYBOOK_HOURS.max) return { day: "today", hour: p.run_hour, soon: true };
  }
  return { day: "tomorrow", hour: p.run_hour, soon: false };
}
