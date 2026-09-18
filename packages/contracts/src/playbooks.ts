import type { SchemaSet } from "./schema-sets";
import { POLICY_CLASS_WORDS } from "./config";
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
import { purposeOfPlaybook } from "./consent";
import type { PersonRowVM } from "./people";
import type { ParamSpec } from "./templates";
import { visitStartTime, type VisitDto } from "./calendar-people";
import { shiftKey, zoneMidnight } from "./calendar";

const DAY_MS = 86_400_000;

/**
 * What starts a playbook. A list trigger sends to a list that keeps itself
 * current; the cadence trigger to everyone, on a rhythm; a visit trigger to
 * the people the calendar names for one day — the day before an appointment,
 * the day after a visit. The reminder runs under the Booking row of the
 * Autonomy pane: the setting that governs bookings governs their reminders.
 */
export const PLAYBOOK_TRIGGERS = [
  { id: "quiet_30", label: "Win-back", list: "quiet", cls: "reengage", kind: "list", hint: "Nothing heard in 30 days" },
  { id: "new_week", label: "Welcome", list: "new_week", cls: "campaign", kind: "list", hint: "First contact in the last 7 days" },
  { id: "phoned_only", label: "Save our number", list: "phoned_only", cls: "reengage", kind: "list", hint: "Only ever phoned, never texted" },
  { id: "everyone_monthly", label: "The month's offer", list: null, cls: "campaign", kind: "cadence", hint: "Everyone who said yes, on a cadence" },
  { id: "visit_tomorrow", label: "Visit reminder", list: null, cls: "booking", kind: "visit", hint: "The day before an appointment on the calendar" },
  { id: "visited", label: "After the visit", list: null, cls: "reengage", kind: "visit", hint: "The day after a visit, when nothing is booked next" },
] as const;
export type PlaybookTrigger = (typeof PLAYBOOK_TRIGGERS)[number]["id"];
export type PlaybookTriggerKind = (typeof PLAYBOOK_TRIGGERS)[number]["kind"];
export type PlaybookPolicyClass = SchemaSet<"playbooks.policy_class">;

export const PLAYBOOK_STATES = ["running", "paused"] as const;
export type PlaybookState = (typeof PLAYBOOK_STATES)[number];

export const PLAYBOOK_DEFAULTS = { runHour: 10, capPerRun: 25, gapDays: 90, cadenceDays: 30 } as const;
export const PLAYBOOK_HOURS = { min: 9, max: 20 } as const;
/** The hours a send may go out in, as the pages say them: "9:00–20:59", "between 9:00 and 20:59", and the hour a moved send waits for. */
export const SENDING_HOURS_WORDS = {
  min: PLAYBOOK_HOURS.min,
  max: PLAYBOOK_HOURS.max,
  first: `${PLAYBOOK_HOURS.min}:00`,
  range: `${PLAYBOOK_HOURS.min}:00–${PLAYBOOK_HOURS.max}:59`,
  between: `between ${PLAYBOOK_HOURS.min}:00 and ${PLAYBOOK_HOURS.max}:59`,
} as const;
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
 * The people a run may reach: the trigger's list crossed with who said yes to
 * THIS KIND of message, minus anyone who heard from this playbook within its
 * gap (its cadence, for the month's offer), minus anyone who heard from any
 * playbook this week; the longest-unheard first; at most the cap.
 *
 * The purpose is the trigger's own `cls`, which every trigger has always
 * declared and which nothing has ever read. `booking` is a reminder about an
 * appointment the customer made; everything else is promotional.
 *
 * That distinction fixes a real loss. `visit_tomorrow` sends the one utility
 * template in the starter library to somebody with a visit on the calendar
 * tomorrow -- and it was skipped with `not_opted_in` unless that person had
 * given marketing-grade consent. A customer who booked an appointment was not
 * reminded of it because they had never asked for offers.
 */
export function eligibleForPlaybook(
  rows: PersonRowVM[],
  p: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days">,
  touches: Touches,
  nowMs: number,
): PersonRowVM[] {
  const t = triggerOf(p.trigger);
  if (!t) return [];
  const purpose = purposeOfPlaybook(t.cls);
  if (t.kind === "visit") {
    // The calendar decides, one message per visit: the run is daily and a
    // visit is on one day, so the gap and the week's breath do not apply —
    // a reminder must go whatever else the person heard this week, and the
    // thank-you two days after it must go too. Day-keyed by the calendar's
    // own clock, never by hours: eleven at night tomorrow is still tomorrow.
    const pool = eligibleFor(rows, "everyone", null, null, purpose).filter((r) => {
      if (!r.calendarTz) return false;
      if (p.trigger === "visit_tomorrow") return r.nextVisitDate !== null && r.nextVisitDate === localDate(r.calendarTz, new Date(nowMs + DAY_MS));
      return r.lastVisitDate !== null && r.lastVisitDate === localDate(r.calendarTz, new Date(nowMs - DAY_MS)) && !r.booked;
    });
    pool.sort((a, b) => (p.trigger === "visit_tomorrow" ? (a.nextVisitMs ?? 0) - (b.nextVisitMs ?? 0) : (a.lastVisitMs ?? 0) - (b.lastVisitMs ?? 0)));
    // The cap is a fatigue limit for offers; a reminder is owed to everyone
    // with a visit. Capped, the twenty-sixth appointment of a busy day got no
    // reminder at all -- not deferred, dropped, since the run is once a day.
    // The number's own daily limit still applies, in run-playbook, and says so.
    return pool;
  }
  const pool = t.list ? eligibleFor(rows, "list", t.list, null, purpose) : eligibleFor(rows, "everyone", null, null, purpose);
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
export function scheduleLine(p: Pick<PlaybookDto, "trigger" | "run_hour" | "cap_per_run" | "gap_days" | "cadence_days">): string {
  const at = `${two(p.run_hour)}:00`;
  if (triggerOf(p.trigger)?.kind === "visit") return `Daily ${at} · ${p.trigger === "visit_tomorrow" ? "everyone with a visit tomorrow" : "everyone who visited yesterday"} · up to ${p.cap_per_run}`;
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

/**
 * What a playbook will actually DO on its next run.
 *
 * "Running · next run tomorrow 10:00" is a promise, and on a workspace whose
 * list is empty it is one the run cannot keep. The salon had three playbooks,
 * two of them running every day, and every one of them watched a pool of
 * nought -- so two runs a day reached nobody and had been doing so since the
 * list emptied. The card said it: "0 people on the list said yes", in the
 * middle of a sentence, as a link, while the hour it would run at was in bold.
 *
 * An empty pool has two different causes and they are not the same news:
 * nobody on the list has said yes to offers (a thing to go and fix), or
 * everybody has and they all heard from you this week (a thing to wait out).
 */
export type PlaybookReach = "waiting" | "paused" | "sends" | "nobody" | "all-heard";

export function playbookReach(p: { state: string; candidates: number; held: number; waiting?: unknown }): PlaybookReach {
  if (p.waiting) return "waiting";
  if (p.state !== "running") return "paused";
  if (p.candidates > 0) return "sends";
  return p.held > 0 ? "all-heard" : "nobody";
}

/** The few words beside the state, when the schedule is not the whole truth; null when it is. */
export const PLAYBOOK_REACH_WORDS: Record<PlaybookReach, string | null> = {
  waiting: null,
  paused: null,
  sends: null,
  nobody: "nobody to send to",
  "all-heard": "waiting out the week's gap",
};

export const PLAYBOOK_CLASS_LABEL: Record<PlaybookPolicyClass, string> = {
  reengage: POLICY_CLASS_WORDS.reengage.short,
  campaign: POLICY_CLASS_WORDS.campaign.short,
  booking: POLICY_CLASS_WORDS.booking.short,
};

/**
 * The words a visit playbook's slots take for one person — when, and what
 * for — from the visit the run read. Resolved when the run is made and kept
 * on the recipient row, so the send says what the calendar said then.
 */
export function visitFactsFor(
  trigger: string,
  visit: Pick<VisitDto, "start" | "title" | "all_day"> | null,
  tz: string,
  /** When the words will be read: the send's moment. Absent, they are read now, as the run assumes. */
  sendAt?: Date,
): { visit_when: string; visit_service: string } | null {
  const t = triggerOf(trigger);
  if (!t || t.kind !== "visit" || !visit) return null;
  return {
    visit_when: trigger === "visit_tomorrow" ? `${visitDayWord(visit, tz, sendAt, "tomorrow")} at ${visitStartTime(visit, tz)}` : visitDayWord(visit, tz, sendAt, "yesterday"),
    visit_service: visit.title.trim() || "your appointment",
  };
}

/**
 * "tomorrow", "today", "yesterday", or the day's name: the visit's day as it
 * stands from the moment the words are read. A run asked for at eleven at
 * night goes at nine the next morning, and "tomorrow at 2:00 PM" said then is
 * the wrong day; the send's moment is what the words must be relative to.
 */
export function visitDayWord(visit: Pick<VisitDto, "start">, tz: string, sendAt: Date | undefined, assumed: string): string {
  if (!sendAt) return assumed;
  const visitDay = localDate(tz, new Date(visit.start));
  const sendDay = localDate(tz, sendAt);
  const delta = Math.round((Date.parse(`${visitDay}T00:00:00Z`) - Date.parse(`${sendDay}T00:00:00Z`)) / DAY_MS);
  if (delta === 1) return "tomorrow";
  if (delta === 0) return "today";
  if (delta === -1) return "yesterday";
  try {
    return `on ${new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date(visit.start))}`;
  } catch {
    return delta > 0 ? "soon" : "recently";
  }
}
