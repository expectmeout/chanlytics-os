/**
 * Campaigns on the Calendar (the Calendar's lane C, 13 Oct 2026): what GET calendar/runs answers for a span of days, and
 * the marks a day draws from it. Only what the database holds is said as a fact; a forecast says "to come", and nothing
 * is called a launch, since no campaign has a launch date. A mark is never a block: it takes no time on the board, never
 * counts as taken, never narrows an open time, and never reaches Today's Now and Next (it lives outside GET calendar).
 *
 * What a day may carry, and where its words come from:
 * - a one-off send (a broadcast with no campaign) at its time, in Sent's words for its state (BROADCAST_STATE_LABELS);
 * - a campaign's run waiting for approval, on its day and never at an hour (its scheduled_for is the moment it was made),
 *   the page's one amber (RUN_WAITING_WORDS), "Too late to approve" once its day has passed;
 * - the campaign runs that went, at the minute they went, those within a quarter hour one quiet "N campaigns · N sent"
 *   (todayRunWords' kind), the day's sheet naming each;
 * - each running campaign's next run, today or tomorrow only, per campaign: "10 AM · … · to come" where its class sends
 *   by itself or after a Stop, "to approve tomorrow" where it waits for a person; never where a run row already stands for
 *   it that day or a later one, where it has ended, or while the workspace is paused;
 * - a campaign's last day (00416 `until`);
 * - cold email, on its own switch: a reach-out's runs a day, counts only ("12 written"), never a time, since each lead is
 *   written to in its own zone.
 */
import { BROADCAST_STATE_LABELS, type BroadcastState } from "../broadcasts/broadcasts";
import { addressOf } from "../activity/record-address";
import { RUN_WAITING_WORDS } from "../shell/campaign-rooms";
import type { Tone } from "../shell/tone";
import { campaignEnded, nextRunOf, planRun } from "../playbooks/playbook-schedule";
import { clockInZone, dayInZone } from "./zone-math";
import { shiftKey } from "./day-keys";
import { clockLabel } from "./calendar-words";
import { plural } from "../shared/words";
import { MIN_MS } from "../shared/time";
import type { SequenceMode } from "../sequences/sequence";
import { SEQUENCES_ROUTE } from "../sequences/sequence-address";

/** One run as the span's read carries it: a one-off send, a campaign's run, or a reach-out step's. */
export interface CalendarRunDto {
  id: string;
  name: string;
  state: BroadcastState;
  /** ISO instants. */
  scheduled_for: string;
  started_at: string | null;
  finished_at: string | null;
  /** A campaign's run: the business's day it ran for (YYYY-MM-DD). Null for a one-off send. */
  run_for: string | null;
  playbook_id: string | null;
  /** A reach-out step's run (reach-out-rules.ts isReachOutRun): its emails are cold email, to businesses. */
  reach_out: boolean;
  /** How many it sent (run_counts, 00374), and how many it was made for. */
  sent: number;
  recipient_count: number;
}

/** A campaign as its schedule says it: what its next run and its last day are worked out from. */
export interface CalendarMomentDto {
  id: string;
  name: string;
  /** Its moment (playbook-triggers.ts): the day-before reminder is `visit_tomorrow`, which a visit's sheet names. */
  trigger: string;
  /** running, paused, … */
  state: string;
  /**
   * How its next batch is decided (contracts batchModeOf over its sequence's mode and its words' OK, decision 0064): auto,
   * veto or ask, as the run will plan it.
   */
  mode: SequenceMode;
  run_hour: number;
  last_run_for: string | null;
  until: string | null;
  /** A reach-out chain's step: its runs are cold email, and it has no forecast here. */
  reach_out: boolean;
}

/** What `GET /api/v1/calendar/runs?from=&days=` returns. */
export interface CalendarRunsDto {
  timezone: string;
  from: string;
  days: number;
  /** The workspace is paused (billing): nothing goes out, and no run is forecast. */
  paused: boolean;
  runs: CalendarRunDto[];
  moments: CalendarMomentDto[];
}

/** What a mark is: a one-off send, a campaign run waiting or failed, the day's runs that went, a next run, a last day, cold email. */
export type CalendarRunKind = "send" | "run" | "campaigns" | "next" | "last_day" | "cold";

/** One run folded into a mark, as the mark's sheet lists it. */
export interface CalendarRunItem {
  name: string;
  words: string;
  route: string;
}

/** A mark a day draws: never a block, never taken time. */
export interface CalendarRunMark {
  /** Unique within its day. */
  key: string;
  kind: CalendarRunKind;
  /** Hours from midnight by the business's clock; null for a mark of the day alone (a run waiting, a last day, cold email). */
  t: number | null;
  /** "10 AM", or "" for a mark of the day alone. */
  time: string;
  name: string;
  /** "42 sent", "Waiting for your approval", "to come" (after its time), "last day", "12 written". */
  words: string;
  tone: Tone;
  /** Still to come: drawn hollow. */
  ahead: boolean;
  /** Cold email: drawn only with Show's Cold email on. */
  cold: boolean;
  /** Its one door, and the door's words. */
  route: string;
  door: string;
  /** Named in Month, where the runs that went and the forecasts are not drawn. */
  named: boolean;
  /** What the mark folds, each with its own door: the day's runs that went, a chain's runs. */
  items: CalendarRunItem[];
}

/** The two doors a mark opens: a run is Sent's, a campaign Campaigns'. */
const CALENDAR_RUN_DOORS = { sent: "Open in Sent", campaigns: "Open in Campaigns" } as const;

/**
 * The words Show says: its switches (the first is the workspace's own word for what is booked, appointmentWords' `Many`,
 * locked on) and its value, and the service picker's word now that it only filters the open times.
 */
export const CALENDAR_SHOW_WORDS = {
  label: "Show",
  always: "Always",
  open: "Open times",
  campaigns: "Campaigns",
  cold: "Cold email",
  /** The capsule's value: what is on beside the visits, of what the workspace has to show. */
  value: (
    on: { open: boolean; campaigns: boolean; cold: boolean },
    offered: { campaigns: boolean; cold: boolean },
  ): string => {
    const campaigns = on.campaigns && offered.campaigns;
    const cold = on.cold && offered.cold;
    const all = on.open && (campaigns || !offered.campaigns) && (cold || !offered.cold);
    if (all) return "Everything";
    const parts = [on.open ? "Open times" : null, campaigns ? "campaigns" : null, cold ? "cold email" : null];
    const said = parts.filter(Boolean).join(", ");
    return said ? said.charAt(0).toUpperCase() + said.slice(1) : "Bookings only";
  },
  /** The service picker's word now that it only filters the open times: "Open for · Any service". */
  openFor: "Open for",
  anyService: "Any service",
} as const;

/** The words of the day's sheet of runs. */
export const CALENDAR_RUN_SHEET_WORDS = {
  kicker: (day: string) => `Campaigns · ${day}`,
  toCome: "to come",
  runs: "runs",
  withinTheHour: "within the hour",
  toApprove: "to approve",
  lastDay: "last day",
  tooLate: "Too late to approve",
  written: (n: number) => `${n} written`,
  planned: (n: number) => `${n} planned`,
  sent: (n: number) => `${n} sent`,
  many: "Campaigns",
  failed: "Failed",
  /** D13: the day's sheet offers a send of its own (the composer, Send once, where its When picks the day). */
  schedule: "Schedule a message",
} as const;

const RUN_WORDS = CALENDAR_RUN_SHEET_WORDS;

/** An instant's hours from midnight by the business's clock. */
function hoursIn(tz: string, ms: number): number {
  const c = clockInZone(tz, ms);
  return c.hh + c.mm / 60;
}

/** Where a run sits: finished, else started, else scheduled (lifecycle-tiles.ts wentAt), as an instant. */
const placedAt = (r: CalendarRunDto): number => Date.parse(r.finished_at ?? r.started_at ?? r.scheduled_for);

/** The marks of a span, day by day, as `push` lays them. */
type Days = Map<string, CalendarRunMark[]>;

/** A mark on a day inside the span; one outside it is dropped. */
function pushOn(days: Days, day: string, mark: CalendarRunMark): void {
  days.get(day)?.push(mark);
}

/** A one-off send, at its time, in Sent's words for its state; a cancelled one is not drawn, as Sent's strip hides it. */
function sendMark(r: CalendarRunDto, tz: string): CalendarRunMark | null {
  if (r.state === "canceled") return null;
  const at = placedAt(r);
  const waiting = r.state === "pending_approval";
  const t = waiting || !Number.isFinite(at) ? null : hoursIn(tz, at);
  const words =
    r.state === "sent"
      ? RUN_WORDS.sent(r.sent)
      : r.state === "sending"
        ? `${BROADCAST_STATE_LABELS.sending} · ${RUN_WORDS.sent(r.sent)}`
        : r.state === "scheduled"
          ? `${BROADCAST_STATE_LABELS.scheduled} · ${plural(r.recipient_count, "person", "people")}`
          : BROADCAST_STATE_LABELS[r.state];
  const tone: Tone =
    r.state === "failed"
      ? "danger"
      : waiting
        ? "warn"
        : r.state === "sending"
          ? "accent"
          : r.state === "scheduled"
            ? "info"
            : "plain";
  return {
    key: `send:${r.id}`,
    kind: "send",
    t,
    time: t === null ? "" : clockLabel(t),
    name: r.name,
    words,
    tone,
    ahead: r.state === "scheduled" || waiting,
    cold: false,
    route: addressOf({ kind: "send", id: r.id }),
    door: CALENDAR_RUN_DOORS.sent,
    named: true,
    items: [],
  };
}

/** A campaign's run that waits for a person, on its day and at no hour; "Too late to approve" once that day has passed. */
function waitingMark(r: CalendarRunDto, name: string, todayKey: string): CalendarRunMark {
  const late = !!r.run_for && r.run_for < todayKey;
  return {
    key: `run:${r.id}`,
    kind: "run",
    t: null,
    time: "",
    name,
    words: late ? RUN_WORDS.tooLate : RUN_WAITING_WORDS,
    tone: late ? "plain" : "warn",
    ahead: !late,
    cold: false,
    route: addressOf({ kind: "send", id: r.id }),
    door: CALENDAR_RUN_DOORS.sent,
    named: true,
    items: [],
  };
}

/** A campaign's run that failed, at the time it tried. */
function failedMark(r: CalendarRunDto, name: string, tz: string): CalendarRunMark {
  const at = placedAt(r);
  const t = Number.isFinite(at) ? hoursIn(tz, at) : null;
  return {
    key: `run:${r.id}`,
    kind: "run",
    t,
    time: t === null ? "" : clockLabel(t),
    name,
    words: RUN_WORDS.failed,
    tone: "danger",
    ahead: false,
    cold: false,
    route: addressOf({ kind: "send", id: r.id }),
    door: CALENDAR_RUN_DOORS.sent,
    named: true,
    items: [],
  };
}

/** Runs that went within this many minutes of the first of them are one mark on the board: the minute a day's runs go at. */
const WENT_FOLD_MS = 15 * MIN_MS;

/**
 * The day's campaign runs that went (or are going), at the minute each went: runs within a quarter hour of each other are
 * one quiet mark, its sheet naming each. They were one mark a day at no hour, so a run at 10 AM stood over the day's
 * first hour (Ruben, 18 Oct 2026: the board draws a campaign at its time, the Calendar's lane C revisited).
 */
function wentMarks(day: string, runs: Array<{ r: CalendarRunDto; name: string }>, tz: string): CalendarRunMark[] {
  const timed = runs.map((x) => ({ ...x, at: placedAt(x.r) })).sort((a, b) => a.at - b.at);
  const folds: Array<typeof timed> = [];
  for (const x of timed) {
    const fold = folds[folds.length - 1];
    const first = fold?.[0];
    if (fold && first && Number.isFinite(x.at) && x.at - first.at <= WENT_FOLD_MS) fold.push(x);
    else folds.push([x]);
  }
  return folds.map((fold) => wentMark(day, fold, tz));
}

/** One fold of runs that went: at its first run's minute, named for its one campaign or counting them. */
function wentMark(
  day: string,
  runs: Array<{ r: CalendarRunDto; name: string; at: number }>,
  tz: string,
): CalendarRunMark {
  const sent = runs.reduce((n, x) => n + x.r.sent, 0);
  const one = runs.length === 1 ? runs[0] : undefined;
  const first = runs[0];
  const t = first && Number.isFinite(first.at) ? hoursIn(tz, first.at) : null;
  return {
    key: `campaigns:${day}:${first?.r.id ?? ""}`,
    kind: "campaigns",
    t,
    time: t === null ? "" : clockLabel(t),
    name: one ? one.name : plural(runs.length, "campaign", "campaigns"),
    words: RUN_WORDS.sent(sent),
    tone: "plain",
    ahead: false,
    cold: false,
    route: one ? addressOf({ kind: "send", id: one.r.id }) : SEQUENCES_ROUTE,
    door: CALENDAR_RUN_DOORS.sent,
    named: false,
    items: runs.map((x) => ({
      name: x.name,
      words: RUN_WORDS.sent(x.r.sent),
      route: addressOf({ kind: "send", id: x.r.id }),
    })),
  };
}

/** A chain's cold email on a day: counts only, never a time (each lead's own zone). */
function coldMark(
  day: string,
  playbookId: string,
  name: string,
  runs: CalendarRunDto[],
  todayKey: string,
): CalendarRunMark {
  const sent = runs.reduce((n, r) => n + r.sent, 0);
  const planned = runs.filter((r) => r.state === "scheduled").reduce((n, r) => n + r.recipient_count, 0);
  const waiting = runs.some((r) => r.state === "pending_approval") && day >= todayKey;
  const words = waiting ? RUN_WAITING_WORDS : sent ? RUN_WORDS.written(sent) : RUN_WORDS.planned(planned);
  const first = runs[0];
  return {
    key: `cold:${playbookId}:${day}`,
    kind: "cold",
    t: null,
    time: "",
    name,
    words,
    tone: waiting ? "warn" : "plain",
    ahead: waiting || (!sent && planned > 0),
    cold: true,
    route: runs.length === 1 && first ? addressOf({ kind: "send", id: first.id }) : SEQUENCES_ROUTE,
    door: CALENDAR_RUN_DOORS.sent,
    named: false,
    items: runs.map((r) => ({
      name,
      words: r.sent ? RUN_WORDS.written(r.sent) : RUN_WORDS.planned(r.recipient_count),
      route: addressOf({ kind: "send", id: r.id }),
    })),
  };
}

/** The runs of the span laid on their days: one-off sends, runs waiting or failed, what went, and cold email. */
function runMarks(dto: CalendarRunsDto, days: Days, todayKey: string, names: ReadonlyMap<string, string>): void {
  const tz = dto.timezone;
  const went = new Map<string, Array<{ r: CalendarRunDto; name: string }>>();
  const cold = new Map<string, { day: string; id: string; runs: CalendarRunDto[] }>();
  for (const r of dto.runs) {
    const at = placedAt(r);
    const day = r.run_for ?? (Number.isFinite(at) ? dayInZone(tz, at).key : null);
    if (!day || !days.has(day) || r.state === "canceled") continue;
    const name = (r.playbook_id ? names.get(r.playbook_id) : null) ?? r.name;
    if (r.reach_out) {
      const key = `${r.playbook_id ?? r.id}:${day}`;
      const c = cold.get(key) ?? { day, id: r.playbook_id ?? r.id, runs: [] };
      c.runs.push(r);
      cold.set(key, c);
    } else if (!r.playbook_id) {
      const m = sendMark(r, tz);
      if (m) pushOn(days, day, m);
    } else if (r.state === "pending_approval") pushOn(days, day, waitingMark(r, name, todayKey));
    else if (r.state === "failed") pushOn(days, day, failedMark(r, name, tz));
    else if (r.state === "sent" || r.state === "sending") went.set(day, [...(went.get(day) ?? []), { r, name }]);
  }
  for (const [day, runs] of went) for (const m of wentMarks(day, runs, tz)) pushOn(days, day, m);
  for (const c of cold.values())
    pushOn(days, c.day, coldMark(c.day, c.id, names.get(c.id) ?? c.runs[0]?.name ?? "", c.runs, todayKey));
}

/**
 * Each running campaign's next run, per campaign: its day (today or tomorrow, nextRunOf), its hour where its class sends
 * by itself or after a Stop, the day alone where it waits for a person, nothing where the class is never. Never where a
 * run already stands for it that day (Coming up's rule), past its last day, or while the workspace is paused.
 */
function nextMarks(dto: CalendarRunsDto, days: Days, now: Date, todayKey: string): void {
  if (dto.paused) return;
  const tz = dto.timezone;
  const standing = new Set(
    dto.runs.filter((r) => r.playbook_id && r.run_for).map((r) => `${r.playbook_id}:${r.run_for}`),
  );
  for (const p of dto.moments) {
    if (p.state !== "running" || p.reach_out) continue;
    const next = nextRunOf(p, tz, now);
    const day = next.day === "today" ? todayKey : shiftKey(todayKey, 1);
    // A run already made for that day or a later one (an approval asked a day ahead) is the run: it is drawn, not forecast.
    const made = !!p.last_run_for && p.last_run_for >= day;
    if (made || standing.has(`${p.id}:${day}`) || campaignEnded(p, day)) continue;
    const sends = planRun(p.mode, now).kind === "send";
    const t = sends && !next.soon ? next.hour : null;
    const when = next.day === "today" ? "today" : "tomorrow";
    pushOn(days, day, {
      key: `next:${p.id}`,
      kind: "next",
      t,
      time: t === null ? "" : clockLabel(t),
      name: p.name,
      // The hour leads where it has one (`time`), so the words do not say it twice.
      words: sends
        ? t === null
          ? `${RUN_WORDS.runs} ${RUN_WORDS.withinTheHour} · ${RUN_WORDS.toCome}`
          : RUN_WORDS.toCome
        : `${RUN_WORDS.toApprove} ${when}`,
      tone: "info",
      ahead: true,
      cold: false,
      route: addressOf({ kind: "campaign", id: p.id }),
      door: CALENDAR_RUN_DOORS.campaigns,
      named: false,
      items: [],
    });
  }
}

/** A running campaign's last day, where it falls in the span. */
function lastDayMarks(dto: CalendarRunsDto, days: Days): void {
  for (const p of dto.moments) {
    if (p.state !== "running" || p.reach_out || !p.until || !days.has(p.until)) continue;
    pushOn(days, p.until, {
      key: `last:${p.id}`,
      kind: "last_day",
      t: null,
      time: "",
      name: p.name,
      words: RUN_WORDS.lastDay,
      tone: "plain",
      ahead: false,
      cold: false,
      route: addressOf({ kind: "campaign", id: p.id }),
      door: CALENDAR_RUN_DOORS.campaigns,
      named: true,
      items: [],
    });
  }
}

/** The order a day lists its marks in: what waits first, then the day's own, then by the clock. */
const KIND_ORDER: Record<CalendarRunKind, number> = { run: 0, last_day: 1, send: 2, next: 3, campaigns: 4, cold: 5 };

/**
 * The marks of the span, by day key, each day in its order: a run waiting first, then a last day, then by the clock.
 * Every day of the span has an entry, empty where nothing is drawn. Pure.
 */
export function calendarRunMarksOf(dto: CalendarRunsDto, now: Date): Map<string, CalendarRunMark[]> {
  const days: Days = new Map();
  for (let i = 0; i < dto.days; i++) days.set(shiftKey(dto.from, i), []);
  const todayKey = dayInZone(dto.timezone, now.getTime()).key;
  const names = new Map(dto.moments.map((p) => [p.id, p.name]));
  runMarks(dto, days, todayKey, names);
  nextMarks(dto, days, now, todayKey);
  lastDayMarks(dto, days);
  for (const marks of days.values())
    marks.sort(
      (a, b) => (a.t ?? -1) - (b.t ?? -1) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name),
    );
  return days;
}

/** Whether a mark is drawn under Show's switches: campaigns for every mark but cold email, which has its own. */
export function runMarkShown(m: Pick<CalendarRunMark, "cold">, show: { campaigns: boolean; cold: boolean }): boolean {
  return m.cold ? show.cold : show.campaigns;
}
