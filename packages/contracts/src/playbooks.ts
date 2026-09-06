/**
 * Playbooks: a standing rule that sends one approved template to newly
 * eligible people who said yes, under the workspace's autonomy mode.
 *
 * Everything a playbook may do is decided here, once, and executed by the
 * hourly sweep with the same predicates the People page and the broadcast
 * route use: who is on the list, who said yes, who already heard from this
 * playbook, who heard from any playbook this week. Broadcasts is "send this
 * once"; a playbook is "keep doing this".
 */
import { eligibleFor } from "./broadcasts";
import type { PersonRowVM } from "./people";
import type { ParamSpec } from "./templates";

const DAY_MS = 86_400_000;

export const PLAYBOOK_TRIGGERS = [
  { id: "quiet_30", label: "Win-back", list: "quiet", cls: "reengage", hint: "Nothing heard in 30 days" },
  { id: "new_week", label: "Welcome", list: "new_week", cls: "campaign", hint: "First contact in the last 7 days" },
  { id: "phoned_only", label: "Save our number", list: "phoned_only", cls: "reengage", hint: "Only ever phoned, never texted" },
  { id: "everyone_monthly", label: "The month's offer", list: null, cls: "campaign", hint: "Everyone who said yes, on a cadence" },
] as const;
export type PlaybookTrigger = (typeof PLAYBOOK_TRIGGERS)[number]["id"];
export type PlaybookPolicyClass = "reengage" | "campaign";

export const PLAYBOOK_STATES = ["running", "paused"] as const;
export type PlaybookState = (typeof PLAYBOOK_STATES)[number];

export const PLAYBOOK_DEFAULTS = { runHour: 10, capPerRun: 25, gapDays: 90, cadenceDays: 30 } as const;
export const PLAYBOOK_HOURS = { min: 9, max: 20 } as const;
/** One playbook message per person per week, across playbooks. */
export const PLAYBOOK_BREATH_MS = 7 * DAY_MS;
/** Under veto, a run is scheduled this far ahead with a Stop. */
export const PLAYBOOK_VETO_DELAY_MS = 30 * 60_000;
export const PLAYBOOK_NAME_MAX = 80;

export function triggerOf(id: string): (typeof PLAYBOOK_TRIGGERS)[number] | null {
  return PLAYBOOK_TRIGGERS.find((t) => t.id === id) ?? null;
}

export interface PlaybookDto {
  id: string;
  name: string;
  trigger: PlaybookTrigger;
  template_id: string;
  template_name: string;
  template_language: string;
  params: ParamSpec[];
  policy_class: PlaybookPolicyClass;
  state: PlaybookState;
  run_hour: number;
  cap_per_run: number;
  gap_days: number;
  cadence_days: number;
  last_run_for: string | null;
  last_run_at: string | null;
  created_at: string;
}

/** When a person last heard from this playbook, and from any playbook. contact id → ms. */
export interface Touches {
  byThis: Map<string, number>;
  byAny: Map<string, number>;
}

/**
 * The people a run may reach: the trigger's list crossed with who said yes,
 * minus anyone who heard from this playbook within its gap (its cadence, for
 * the month's offer), minus anyone who heard from any playbook this week;
 * the longest-unheard first; at most the cap.
 */
export function eligibleForPlaybook(
  rows: PersonRowVM[],
  p: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days">,
  touches: Touches,
  nowMs: number,
): PersonRowVM[] {
  const t = triggerOf(p.trigger);
  if (!t) return [];
  const pool = t.list ? eligibleFor(rows, "list", t.list, null) : eligibleFor(rows, "everyone", null, null);
  const gapMs = (p.trigger === "everyone_monthly" ? p.cadence_days : p.gap_days) * DAY_MS;
  const picked = pool.filter((r) => {
    const mine = touches.byThis.get(r.id);
    if (mine !== undefined && nowMs - mine < gapMs) return false;
    const any = touches.byAny.get(r.id);
    if (any !== undefined && nowMs - any < PLAYBOOK_BREATH_MS) return false;
    return true;
  });
  picked.sort((a, b) => (a.lastContact.ts ?? 0) - (b.lastContact.ts ?? 0));
  return picked.slice(0, Math.max(1, p.cap_per_run));
}

export type RunPlan =
  | { kind: "send"; state: "scheduled"; at: Date }
  | { kind: "hold"; state: "pending_approval" }
  | { kind: "off" };

/** What a run does under the class's mode: sends now, sends after a stop window, waits for a person, or nothing. */
export function planRun(mode: string | null | undefined, now: Date): RunPlan {
  switch (mode) {
    case "auto": return { kind: "send", state: "scheduled", at: now };
    case "veto": return { kind: "send", state: "scheduled", at: new Date(now.getTime() + PLAYBOOK_VETO_DELAY_MS) };
    case "ask": return { kind: "hold", state: "pending_approval" };
    default: return { kind: "off" };
  }
}

function parts(tz: string, now: Date): { date: string; hour: number } {
  try {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
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
export function scheduleLine(p: Pick<PlaybookDto, "trigger" | "run_hour" | "cap_per_run" | "gap_days" | "cadence_days">): string {
  const at = `${two(p.run_hour)}:00`;
  if (p.trigger === "everyone_monthly") return `Every ${p.cadence_days} days at ${at} · up to ${p.cap_per_run} a day`;
  return `Daily ${at} · up to ${p.cap_per_run} · once per person, again after ${p.gap_days} days`;
}

/** "today 10:00", "today, within the hour" or "tomorrow 10:00", by the business's clock; "paused" when it is. */
export function nextRunLabel(p: Pick<PlaybookDto, "state" | "run_hour" | "last_run_for">, tz: string, now: Date): string {
  if (p.state !== "running") return "paused";
  const { date, hour } = parts(tz, now);
  const at = `${two(p.run_hour)}:00`;
  if (p.last_run_for !== date) {
    if (hour < p.run_hour) return `today ${at}`;
    if (hour <= PLAYBOOK_HOURS.max) return "today, within the hour";
  }
  return `tomorrow ${at}`;
}

export const PLAYBOOK_CLASS_LABEL: Record<PlaybookPolicyClass, string> = { reengage: "Re-engage", campaign: "Campaigns" };
