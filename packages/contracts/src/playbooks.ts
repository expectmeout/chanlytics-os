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
import { audienceMembers } from "./broadcasts";
import { purposeOfPlaybook } from "./consent";
import { GET_YES_ROUTE, saidYesTo, saidYesWords, whyNotReceive, type PersonRowVM } from "./people";
import { PARAM_SOURCE_LABELS, type ParamSpec } from "./templates";
import type { BroadcastDto, BroadcastRecipientDto } from "./broadcasts";
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
  return playbookRunReach(rows, p, touches, nowMs).eligible;
}

/**
 * Who a run reaches, out of everyone its moment names, and why each of the
 * rest was left out -- each counted once, under the first rule that left them
 * out, in the order the run applies the rules. So `will` and the eight counts
 * add up to `pool`, and a bar of them is the whole list.
 *
 * A run recorded how many it enrolled and nothing about the rest, so the sheet
 * an owner approves it from could only list the rules that made the list:
 * never "186 of 312", never "94 never said yes" -- and the one of those an
 * owner can do something about (getting their yes) was the one it could not say.
 */
export interface RunReach {
  /** Everyone the moment names: the trigger's list, everyone, or the day's visits. */
  pool: number;
  /** Who the run reaches. */
  will: number;
  /** No number on file: WhatsApp and text both need one. */
  noNumber: number;
  /** Asked to stop, or on the do-not-contact list. */
  stopped: number;
  /** Never said yes to what this playbook sends: offers, or hearing from you. */
  noYes: number;
  /** Heard from this playbook within its gap (its cadence, for the month's offer). */
  heardThis: number;
  /** Heard from any playbook this week. */
  heardAny: number;
  /** Past the cap per run: the longest unheard go first, these next time. */
  overCap: number;
  /** Past the number's daily limit (run-playbook): named, never dropped in silence. */
  overLimit: number;
}

/**
 * The run as drawn: who it reaches, its reach, and `saidYes` -- how many the
 * moment names who said the yes its messages need, a number to send to or not.
 * `reach.noNumber` cannot say that, because no number is the first rule and it
 * counts everyone without one, yes or no. A moment whose yes has no number
 * reaches nobody while somebody on it said yes (#663's rule).
 */
export function playbookRunReach(
  rows: PersonRowVM[],
  p: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days">,
  touches: Touches,
  nowMs: number,
): { eligible: PersonRowVM[]; reach: RunReach; saidYes: number } {
  const reach: RunReach = { pool: 0, will: 0, noNumber: 0, stopped: 0, noYes: 0, heardThis: 0, heardAny: 0, overCap: 0, overLimit: 0 };
  const t = triggerOf(p.trigger);
  if (!t) return { eligible: [], reach, saidYes: 0 };
  const purpose = purposeOfPlaybook(t.cls);
  // Who the moment names, before anyone is left out.
  const named = t.kind === "visit"
    // The calendar's own day, never hours: eleven at night tomorrow is still tomorrow.
    ? rows.filter((r) => {
      if (!r.calendarTz) return false;
      if (p.trigger === "visit_tomorrow") return r.nextVisitDate !== null && r.nextVisitDate === localDate(r.calendarTz, new Date(nowMs + DAY_MS));
      return r.lastVisitDate !== null && r.lastVisitDate === localDate(r.calendarTz, new Date(nowMs - DAY_MS)) && !r.booked;
    })
    : audienceMembers(rows, t.list ? "list" : "everyone", t.list ?? null, null);
  reach.pool = named.length;
  const saidYes = named.filter((r) => saidYesTo(r, purpose)).length;
  const allowed: PersonRowVM[] = [];
  for (const r of named) {
    const why = whyNotReceive(r, purpose);
    if (why === "no_number") reach.noNumber += 1;
    else if (why === "stopped") reach.stopped += 1;
    else if (why === "no_yes") reach.noYes += 1;
    else allowed.push(r);
  }
  if (t.kind === "visit") {
    // The calendar decides, one message per visit: the run is daily and a
    // visit is on one day, so the gap and the week's breath do not apply —
    // a reminder must go whatever else the person heard this week, and the
    // thank-you two days after it must go too.
    allowed.sort((a, b) => (p.trigger === "visit_tomorrow" ? (a.nextVisitMs ?? 0) - (b.nextVisitMs ?? 0) : (a.lastVisitMs ?? 0) - (b.lastVisitMs ?? 0)));
    // The cap is a fatigue limit for offers; a reminder is owed to everyone
    // with a visit. Capped, the twenty-sixth appointment of a busy day got no
    // reminder at all -- not deferred, dropped, since the run is once a day.
    // The number's own daily limit still applies, in run-playbook, and says so.
    reach.will = allowed.length;
    return { eligible: allowed, reach, saidYes };
  }
  const gapMs = (p.trigger === "everyone_monthly" ? p.cadence_days : p.gap_days) * DAY_MS;
  const picked = allowed.filter((r) => {
    const mine = touches.byThis.get(r.id);
    if (mine !== undefined && nowMs - mine < gapMs) { reach.heardThis += 1; return false; }
    const any = touches.byAny.get(r.id);
    if (any !== undefined && nowMs - any < PLAYBOOK_BREATH_MS) { reach.heardAny += 1; return false; }
    return true;
  });
  picked.sort((a, b) => (a.lastContact.ts ?? 0) - (b.lastContact.ts ?? 0));
  const eligible = picked.slice(0, Math.max(1, p.cap_per_run));
  reach.overCap = picked.length - eligible.length;
  reach.will = eligible.length;
  return { eligible, reach, saidYes };
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
 * "nobody" also holds a list whose yes has no number to send to, and an empty
 * list: nobody to send to is true of both, and only a missing yes is fixed by
 * getting one (playbookReachDoor).
 */
export type PlaybookReach = "waiting" | "paused" | "sends" | "nobody" | "all-heard" | "uncounted";

/**
 * `candidates` and `held` are null when the moment could not be counted (the
 * server's read failed): "uncounted", which claims no reach at all. It read
 * "nobody", said "nobody to send to" and offered the QR over a failed read.
 */
export function playbookReach(p: { state: string; candidates: number | null; held: number | null; waiting?: unknown }): PlaybookReach {
  if (p.waiting) return "waiting";
  if (p.state !== "running") return "paused";
  if (p.candidates === null || p.held === null) return "uncounted";
  if (p.candidates > 0) return "sends";
  return p.held > 0 ? "all-heard" : "nobody";
}

/**
 * Where a reach that can be fixed is fixed, or null. "nobody" is fixed by a yes
 * only when the moment names somebody and not one of them said the yes the
 * playbook needs (`named.saidYes`, playbookRunReach's): then getting it is the
 * move. Not when the ones who said it have no number to send to -- the QR would
 * ask them for an answer they gave (#663's rule) -- nor when the moment names
 * nobody, nor when who it names could not be read. "all-heard" is waited out,
 * not fixed, and gets no door.
 */
export function playbookReachDoor(reach: PlaybookReach, named: { pool: number; saidYes: number } | null): { label: string; to: string } | null {
  return reach === "nobody" && named !== null && named.pool > 0 && named.saidYes === 0 ? { label: "Get their yes", to: GET_YES_ROUTE } : null;
}

/**
 * How many on a playbook's list said yes, as its card says it when nobody can be
 * sent a run and somebody said the yes it needs: how many did, and what they are
 * missing, in the send screen's words (saidYesWords). Null otherwise, and the
 * card's own count stands -- who a run reaches now, the shorthand People uses.
 * It read "0 people on the list said yes" about a list whose yes had no number.
 */
export function playbookNoNumberWords(p: Pick<PlaybookDto, "policy_class"> & { candidates: number | null; held: number | null }, named: { saidYes: number } | null): string | null {
  if (!named || named.saidYes === 0 || p.candidates === null || p.held === null || p.candidates + p.held > 0) return null;
  return saidYesWords("the list", purposeOfPlaybook(p.policy_class), 0, named.saidYes);
}

/** The few words beside the state, when the schedule is not the whole truth; null when it is. */
export const PLAYBOOK_REACH_WORDS: Record<PlaybookReach, string | null> = {
  waiting: null,
  paused: null,
  sends: null,
  nobody: "nobody to send to",
  "all-heard": "waiting out the week's gap",
  // The page says once, over the cards, that who each moment reaches could not be read.
  uncounted: null,
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

/* --------------------------- a run waiting on you --------------------------- */

export interface ApprovalVM {
  /** How many it reaches when approved: the people it enrolled. */
  will: number;
  /**
   * The rules that made its list, in words -- true of everyone on it by
   * construction (eligibleForPlaybook). What a run made before runs kept who
   * they left out can say, and all it can.
   */
  rules: string[];
  /**
   * Out of how many, and who the rest are: everyone its moment named, as the
   * run counted them when it was drawn (playbookRunReach). `held` is who waits
   * only for time -- heard from a playbook lately, past the number's day -- and
   * is the bar's amber; the rest of the bar is grey: no yes, a stop, no number,
   * past the cap. Each reason is a line, the most first, and the one an owner
   * can act on carries its door. Null for a run that kept no count.
   */
  of: { pool: number; held: number; lines: { n: number; words: string; tone: "warn" | "plain"; door: { words: string; to: string } | null }[] } | null;
  /** One value per slot, as `reader` gets them. */
  values: string[];
  /** Whose message the words are: the first person on it with a name. Null for a run with nobody on it. */
  reader: string | null;
  /** How many a greeting by name reaches with no name on file: they get "Hi there" (resolveParams). */
  hiThere: number;
  /** The act: "Approve — 186 now", or "at 9:00" after hours (approveRun sends at the next open moment). Null when its day has passed. */
  approve: string | null;
  /** Why it cannot be approved: a playbook's run is a day's run, and approveRun refuses it on a later day. */
  expired: string | null;
  /** When it goes, for the line under its name. */
  goes: string;
  /** What skipping costs. */
  skip: string;
}

/**
 * What "of 312" counts on a playbook's card, in its moment's own words: the
 * trigger's list, everyone in People, or the day's visits.
 */
export function poolWords(trigger: string): string {
  const t = triggerOf(trigger);
  if (!t) return "";
  if (t.kind === "visit") return trigger === "visit_tomorrow" ? "with a visit tomorrow" : "who visited yesterday";
  return t.list ? "on the list" : "in People";
}

/**
 * A run's reach, as the sheet says it: out of everyone its moment named, who
 * waits only for time (the bar's amber), and a line for each reason anyone was
 * left out, the most first. "Never said yes" carries the door to getting that
 * yes (#663): of every reason a person is left out, it is the one an owner can
 * change. Null for a run that kept no count.
 */
export function reachLines(
  reach: RunReach | null | undefined,
  p: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days"> | null,
): ApprovalVM["of"] {
  if (!reach || !Number.isFinite(reach.pool)) return null;
  const t = p ? triggerOf(p.trigger) : null;
  const offers = t ? purposeOfPlaybook(t.cls) === "marketing" : true;
  const gap = p ? (p.trigger === "everyone_monthly" ? p.cadence_days : p.gap_days) : null;
  const one = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural);
  const reasons: { n: number; words: string; tone: "warn" | "plain"; door: { words: string; to: string } | null }[] = [
    { n: reach.noYes, words: `never said yes to ${offers ? "offers" : "hearing from you"}`, tone: "plain", door: { words: "Get their yes", to: GET_YES_ROUTE } },
    { n: reach.heardAny, words: "heard from a playbook this week", tone: "warn", door: null },
    { n: reach.heardThis, words: gap ? `heard from this playbook in the last ${gap} days` : "heard from this playbook lately", tone: "warn", door: null },
    { n: reach.stopped, words: "asked you to stop", tone: "plain", door: null },
    { n: reach.noNumber, words: one(reach.noNumber, "has no number on file", "have no number on file"), tone: "plain", door: null },
    { n: reach.overCap, words: `${one(reach.overCap, "waits", "wait")} for the next run${p ? ` — ${p.cap_per_run} a run, the longest unheard first` : ""}`, tone: "plain", door: null },
    { n: reach.overLimit, words: one(reach.overLimit, "is past what the number may start today", "are past what the number may start today"), tone: "warn", door: null },
  ];
  const lines = reasons
    .map((r, rank) => ({ ...r, rank }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || a.rank - b.rank)
    .map(({ n, words, tone, door }) => ({ n, words: `${n} ${words}`, tone, door }));
  return { pool: reach.pool, held: reach.heardAny + reach.heardThis + reach.overLimit, lines };
}

/**
 * A playbook's run waiting on a person, as the sheet says it: the canvas's
 * "approving from the sofa". What it reaches, by the rules that made its list;
 * the words as the first person on it reads them; and what approving does,
 * and when -- or, a day late, why it cannot be approved at all.
 */
export function toApprovalVM(
  d: {
    broadcast: Pick<BroadcastDto, "recipient_count" | "run_for" | "params"> & { audience?: { reach?: RunReach } | null };
    recipients: readonly Pick<BroadcastRecipientDto, "name" | "first_name">[];
  },
  opts: {
    playbook: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days"> | null;
    businessName: string;
    /** The business's day now, "2026-09-21". */
    today: string;
    /** When an approval now would send: the clock's next open moment, and whether it moved past the hours. */
    open: { time: string; moved: boolean };
    /** A run's day in words. */
    day: (ymd: string) => string;
  },
): ApprovalVM {
  const b = d.broadcast;
  const will = b.recipient_count;
  const t = opts.playbook ? triggerOf(opts.playbook.trigger) : null;
  const rules: string[] = [];
  if (t && opts.playbook) {
    rules.push(purposeOfPlaybook(t.cls) === "marketing" ? "each said yes to offers" : "each said yes to hearing from you");
    if (t.kind === "visit") {
      rules.push(opts.playbook.trigger === "visit_tomorrow" ? "each has a visit tomorrow on the calendar" : "each visited yesterday and has nothing booked next");
    } else {
      const gap = opts.playbook.trigger === "everyone_monthly" ? opts.playbook.cadence_days : opts.playbook.gap_days;
      rules.push(`none heard from this playbook in ${gap} days`, "none heard from any playbook this week");
      if (will >= opts.playbook.cap_per_run) rules.push(`capped at ${opts.playbook.cap_per_run} a run, the longest unheard first`);
    }
  }
  const named = d.recipients.find((r) => r.first_name);
  const reader = named ?? d.recipients[0] ?? null;
  const params: readonly ParamSpec[] = Array.isArray(b.params) ? b.params : [];
  const values = params.map((p) => {
    switch (p.kind) {
      case "text": return p.value;
      case "first_name": return reader?.first_name || "there";
      case "business_name": return opts.businessName;
      case "booking_link": return "your booking link";
      default: return `[${PARAM_SOURCE_LABELS[p.kind].toLowerCase()}]`;
    }
  });
  const greets = params.some((p) => p.kind === "first_name");
  const late = !!b.run_for && b.run_for !== opts.today;
  return {
    will,
    rules,
    of: reachLines(b.audience?.reach ?? null, opts.playbook),
    values,
    reader: reader ? reader.name : null,
    hiThere: greets ? d.recipients.filter((r) => !r.first_name).length : 0,
    approve: late ? null : `Approve — ${will} ${opts.open.moved ? `at ${opts.open.time}` : "now"}`,
    expired: late ? `Made for ${opts.day(b.run_for!)}, and that day has passed — its people and its words were that day's. Skip it; the next run starts over.` : null,
    goes: late ? `made for ${opts.day(b.run_for!)}` : opts.open.moved ? `goes at ${opts.open.time} once you approve it` : "goes the moment you approve it",
    skip: "Skipping loses this run only — the playbook keeps running.",
  };
}
