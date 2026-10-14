import "server-only";
import {
  addressOf,
  isDayKey,
  isReachOutRun,
  mondayOf,
  runCountsOf,
  shiftKey,
  triggerOf,
  windowFor,
  zoneDayKey,
  zoneMidnight,
  type BroadcastState,
  type CalendarRunsDto,
  type CalendarWeekDto,
} from "@chanlytics/contracts";
import { momentSchedules, runCounts, runsInSpan, workspacePaused } from "@chanlytics/db";
import { calendarSources, weekFrom, type CalendarSources } from "../calendar/calendar-week";
import { load, stamp, type Reader, type RowRef } from "./index";
import * as facts from "./facts";

/**
 * The calendar's one read for a span (server/calendar/calendar-week.ts calendarSources) with the zone and the settings the turn
 * already holds (readers/facts.ts), so a turn reads the tenant once however many of its reads say "today". Its data
 * carries neither the feed's address nor the raw settings (server/calendar/calendar-week.ts CalendarSources), and it is never an
 * answer: `calendar` below and the calendar route assemble what is answered from it. It writes nothing (D7): the
 * route puts the feed's people in People between this read and the board, when its caller may act.
 */
export const sources: Reader<
  { from: string | null; days: number; fresh: boolean; around?: "today" | null },
  CalendarSources
> = {
  name: "calendarSources",
  async read(rc, { from, days, fresh, around }) {
    // Together: neither waits on the other, and each is a round trip to the database.
    const [{ data: known }, { data: settings }] = await Promise.all([
      load(rc, facts.facts, undefined),
      load(rc, facts.config, undefined),
    ]);
    const { timezone } = known;
    const data = await calendarSources(rc.ctx, rc.tenantId, { from, days, around }, rc.now, {
      fresh,
      timezone,
      config: settings?.config ?? null,
    });
    return { data, rows: [], stamp: stamp() };
  },
};

/**
 * GET calendar as the route answers a read that puts nobody in People (a viewer's): the board's week for a span by
 * the business's clock -- what the feed says is taken, the hours and closures, and the windows the receptionist would
 * offer from the turn's clock. For Ask, which never writes. Each person its days name is a row a citation may name,
 * once, by the name the board gives them, and opens on their profile.
 */
export const calendar: Reader<{ from: string | null; days: number }, { calendar: CalendarWeekDto }> = {
  name: "calendar",
  async read(rc, { from, days }) {
    const s = (await load(rc, sources, { from, days, fresh: false })).data;
    const week = weekFrom(s, s.people, rc.now);
    const rows: RowRef[] = [];
    const named = new Set<string>();
    for (const d of week.days)
      for (const it of d.items)
        if (it.person && !named.has(it.person.id)) {
          named.add(it.person.id);
          rows.push({
            kind: "person",
            id: it.person.id,
            route: addressOf({ kind: "person", id: it.person.id }),
            label: it.person.name,
          });
        }
    return { data: { calendar: week }, rows, stamp: stamp() };
  },
};

/** Nine weeks: the most one read of the board's window covers, as GET calendar's does. */
const MAX_DAYS = 63;

/** The span a read covers, as GET calendar reads its own: a day named, else the board's window around today, else this week. */
function runsSpanOf(
  by: { from: string | null; days: number; around: "today" | null },
  tz: string,
  now: Date,
): { from: string; days: number } {
  const todayKey = zoneDayKey(now.getTime(), tz);
  if (!isDayKey(by.from) && by.around === "today") return windowFor(todayKey);
  const from = isDayKey(by.from) ? by.from : mondayOf(todayKey);
  return { from, days: Math.min(MAX_DAYS, Math.max(1, Math.round(by.days) || 7)) };
}

/**
 * Campaigns over a span of the Calendar (contracts calendar-runs.ts): the runs that fall in it with what each sent
 * (run_counts, 00374, the one statement of what a run earned), every campaign's schedule with its class's mode (the
 * workspace's policies; a class with none is ask, as a run reads it), and whether the workspace is paused. Its own read,
 * outside GET calendar: that one is Today's day and the head's first read too, and a send must never count as taken time
 * or re-read the calendar's feed. Each run is a row a citation may name, by its name.
 */
export const calendarRuns: Reader<
  { from: string | null; days: number; around: "today" | null },
  { runs: CalendarRunsDto }
> = {
  name: "calendarRuns",
  async read(rc, by) {
    const [{ data: known }, { data: policies }] = await Promise.all([
      load(rc, facts.facts, undefined),
      load(rc, facts.policies, undefined),
    ]);
    const tz = known.timezone;
    const span = runsSpanOf(by, tz, rc.now);
    const toDay = shiftKey(span.from, span.days - 1);
    const db = rc.ctx.supabase;
    const [rows, moments, paused] = await Promise.all([
      runsInSpan(db, rc.tenantId, {
        fromIso: new Date(zoneMidnight(tz, span.from)).toISOString(),
        toIso: new Date(zoneMidnight(tz, shiftKey(toDay, 1))).toISOString(),
        fromDay: span.from,
        toDay,
      }),
      momentSchedules(db, rc.tenantId),
      workspacePaused(db, rc.tenantId),
    ]);
    // What each run sent: one read for the span's runs. A database before 00374 answers "missing": nothing said sent.
    const read = rows.length
      ? await runCounts(
          db,
          rc.tenantId,
          rows.map((r) => r.id),
        )
      : "missing";
    const counted = read === "missing" ? null : runCountsOf(read);
    const modes = new Map(policies.map((p) => [p.class, p.mode]));
    const runs: CalendarRunsDto = {
      timezone: tz,
      from: span.from,
      days: span.days,
      paused,
      runs: rows.map((r) => ({
        id: r.id,
        name: r.name,
        state: r.state as BroadcastState,
        scheduled_for: r.scheduled_for,
        started_at: r.started_at,
        finished_at: r.finished_at,
        run_for: r.run_for,
        playbook_id: r.playbook_id,
        reach_out: isReachOutRun(r.audience),
        sent: counted?.[r.id]?.sent ?? 0,
        recipient_count: r.recipient_count,
      })),
      moments: moments.map((p) => ({
        id: p.id,
        name: p.name,
        trigger: p.trigger,
        state: p.state,
        mode: modes.get(p.policy_class) ?? "ask",
        run_hour: p.run_hour,
        last_run_for: p.last_run_for,
        until: p.until,
        trial_until: p.trial_until,
        reach_out: triggerOf(p.trigger)?.kind === "reach_out",
      })),
    };
    const cited: RowRef[] = runs.runs.map((r) => ({
      kind: "broadcast",
      id: r.id,
      route: addressOf({ kind: "send", id: r.id }),
      label: r.name,
    }));
    return { data: { runs }, rows: cited, stamp: stamp() };
  },
};
