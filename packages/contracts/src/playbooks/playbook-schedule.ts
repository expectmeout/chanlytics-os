/**
 * When a playbook runs: the run plan, the workspace's local day and hour, the next open moment, and the schedule's
 * words. Moved whole from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import { shiftKey, zoneMidnight } from "../calendar/calendar";
import { PLAYBOOK_HOURS, PLAYBOOK_VETO_DELAY_MS, triggerOf } from "./playbook-triggers";
import type { PlaybookDto } from "./playbooks";

export type RunPlan =
  { kind: "send"; state: "scheduled"; at: Date } | { kind: "hold"; state: "pending_approval" } | { kind: "off" };

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
    const f = new Intl.DateTimeFormat("en-CA", {
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
  let at = zoneMidnight(tz, day) + PLAYBOOK_HOURS.min * 3_600_000;
  const landed = parts(tz, new Date(at)).hour;
  if (landed !== PLAYBOOK_HOURS.min) at += (PLAYBOOK_HOURS.min - landed) * 3_600_000;
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

const two = (n: number) => String(n).padStart(2, "0");

/** "Daily 10:00 · up to 25 · once per person, again after 90 days". */
export function scheduleLine(
  p: Pick<PlaybookDto, "trigger" | "run_hour" | "cap_per_run" | "gap_days" | "cadence_days">,
): string {
  const at = `${two(p.run_hour)}:00`;
  if (triggerOf(p.trigger)?.kind === "visit")
    return `Daily ${at} · ${p.trigger === "visit_tomorrow" ? "everyone with a visit tomorrow" : "everyone who visited yesterday"} · up to ${p.cap_per_run}`;
  if (p.trigger === "everyone_monthly") return `Every ${p.cadence_days} days at ${at} · up to ${p.cap_per_run} a day`;
  // One follow-up per proposal (0006): no gap to wait out.
  if (triggerOf(p.trigger)?.kind === "deal") return `Daily ${at} · up to ${p.cap_per_run} · once per proposal`;
  return `Daily ${at} · up to ${p.cap_per_run} · once per person, again after ${p.gap_days} days`;
}

/**
 * A playbook's clock in the fewest words -- "runs daily at 10:00", "runs every
 * 30 days at 10:00" -- for a line under something that names it, where
 * `scheduleLine`'s cap and gap would be a sentence too many.
 */
// The trigger is compared, never narrowed, so a row read from the table (a plain string) will do.
export function runsWords(p: { trigger: string; run_hour: number; cadence_days: number }): string {
  const at = `${two(p.run_hour)}:00`;
  return p.trigger === "everyone_monthly" ? `runs every ${p.cadence_days} days at ${at}` : `runs daily at ${at}`;
}

/** "today 10:00", "today, within the hour" or "tomorrow 10:00", by the business's clock; "paused" when it is. */
export function nextRunLabel(
  p: Pick<PlaybookDto, "state" | "run_hour" | "last_run_for">,
  tz: string,
  now: Date,
): string {
  if (p.state !== "running") return "paused";
  const { date, hour } = parts(tz, now);
  const at = `${two(p.run_hour)}:00`;
  if (p.last_run_for !== date) {
    if (hour < p.run_hour) return `today ${at}`;
    if (hour <= PLAYBOOK_HOURS.max) return "today, within the hour";
  }
  return `tomorrow ${at}`;
}
