import "server-only";
import {
  addressOf,
  batchModeOf,
  isDayKey,
  isReachOutRun,
  mondayOf,
  runCountsOf,
  shiftKey,
  triggerOf,
  windowFor,
  zoneDayKey,
  zoneMidnight,
  POST_PLACES,
  POST_STATUSES,
  isOneOf,
  type CalendarPostDto,
  type CalendarRunsDto,
  type CalendarWeekDto,
} from "@chanlytics/contracts";
import { listMomentSchedules, listRunsInSpan, getSequenceModes, isWorkspacePaused } from "@chanlytics/db/campaigns";
import { listFilesByIds, listPostsInSpan } from "@chanlytics/db/files";
import { runCounts } from "@chanlytics/db/reports";
import { getCalendarSources, weekFrom } from "../calendar/week/week";
import type { CalendarSources } from "../calendar/week/items";
import { load, readerStamp, type Reader, type RowRef } from "../shared/reader";
import * as facts from "./facts";

/**
 * The calendar's one read for a span (server/calendar/week/week.ts calendarSources) with the zone and the settings the turn
 * already holds (readers/facts.ts), so a turn reads the tenant once however many of its reads say "today". Its data
 * carries neither the feed's address nor the raw settings (server/calendar/week/week.ts CalendarSources), and it is never an
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
    const data = await getCalendarSources(rc.ctx, rc.tenantId, { from, days, around }, rc.now, {
      fresh,
      timezone,
      config: settings?.config ?? null,
    });
    return { data, rows: [], stamp: readerStamp() };
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
    const result = (await load(rc, sources, { from, days, fresh: false })).data;
    const week = weekFrom(result, result.people, rc.now);
    const rows: RowRef[] = [];
    const named = new Set<string>();
    for (const day of week.days)
      for (const it of day.items)
        if (it.person && !named.has(it.person.id)) {
          named.add(it.person.id);
          rows.push({
            kind: "person",
            id: it.person.id,
            route: addressOf({ kind: "person", id: it.person.id }),
            label: it.person.name,
          });
        }
    return { data: { calendar: week }, rows, stamp: readerStamp() };
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
 * Campaigns over a span of the Calendar (contracts calendar/runs.ts): the runs that fall in it with what each sent
 * (run_counts, 00374, the one statement of what a run earned), every campaign's schedule with how its next batch is
 * decided (contracts batchModeOf over its sequence's mode and its words' OK, as the run plans it), and whether the
 * workspace is paused. Its own read,
 * outside GET calendar: that one is Today's day and the head's first read too, and a send must never count as taken time
 * or re-read the calendar's feed. Each run is a row a citation may name, by its name.
 */
/** The most posts a span of the Calendar draws: a workspace posts a handful a day. */
const SPAN_POSTS_MAX = 300;

/** Content's posts over a span, each named by its piece; one whose piece is gone is not drawn. */
async function postsInSpan(
  db: Parameters<typeof listPostsInSpan>[0],
  tenantId: Parameters<typeof listPostsInSpan>[1],
  fromIso: string,
  toIso: string,
): Promise<CalendarPostDto[]> {
  const rows = await listPostsInSpan(db, tenantId, { fromIso, toIso, limit: SPAN_POSTS_MAX });
  if (rows.length === 0) return [];
  const names = new Map(
    (await listFilesByIds(db, tenantId, [...new Set(rows.map((r) => r.file_id))])).map((f) => [f.id, f.name]),
  );
  return rows.flatMap((row) => {
    const name = names.get(row.file_id);
    if (name === undefined || !isOneOf(POST_PLACES, row.place) || !isOneOf(POST_STATUSES, row.status)) return [];
    return [
      {
        id: row.id,
        file_id: row.file_id,
        name,
        place: row.place,
        status: row.status,
        scheduled_for: row.scheduled_for,
        published_at: row.published_at,
      },
    ];
  });
}

export const calendarRuns: Reader<
  { from: string | null; days: number; around: "today" | null },
  { runs: CalendarRunsDto }
> = {
  name: "calendarRuns",
  async read(rc, by) {
    const db = rc.ctx.supabase;
    // Three waves, where it was four, one after another (Ruben, 21 Oct 2026: the board's campaigns came after its meetings):
    // what needs no clock (every campaign's schedule, the workspace's pause) beside the facts that give the business's;
    // the span's runs, which do, beside each campaign's mode; and what those runs sent, which names them.
    const [{ data: known }, moments, paused] = await Promise.all([
      load(rc, facts.facts, undefined),
      listMomentSchedules(db, rc.tenantId),
      isWorkspacePaused(db, rc.tenantId),
    ]);
    const tz = known.timezone;
    const span = runsSpanOf(by, tz, rc.now);
    const toDay = shiftKey(span.from, span.days - 1);
    const fromIso = new Date(zoneMidnight(tz, span.from)).toISOString();
    const toIso = new Date(zoneMidnight(tz, shiftKey(toDay, 1))).toISOString();
    const [rows, modes, posts] = await Promise.all([
      listRunsInSpan(db, rc.tenantId, { fromIso, toIso, fromDay: span.from, toDay }),
      getSequenceModes(
        db,
        rc.tenantId,
        moments.map((p) => p.sequence_id),
      ),
      // Content's posts over the same days (the content redesign's stage 3), each named by its piece.
      postsInSpan(db, rc.tenantId, fromIso, toIso),
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
    const runs: CalendarRunsDto = {
      timezone: tz,
      from: span.from,
      days: span.days,
      paused,
      runs: rows.map((row) => ({
        id: row.id,
        name: row.name,
        state: row.state,
        scheduled_for: row.scheduled_for,
        started_at: row.started_at,
        finished_at: row.finished_at,
        run_for: row.run_for,
        playbook_id: row.playbook_id,
        reach_out: isReachOutRun(row.audience),
        sent: counted?.[row.id]?.sent ?? 0,
        recipient_count: row.recipient_count,
      })),
      moments: moments.map((moment) => ({
        id: moment.id,
        name: moment.name,
        trigger: moment.trigger,
        state: moment.state,
        mode: batchModeOf({
          mode: modes.get(moment.sequence_id),
          words_ok_at: moment.words_ok_at,
          trigger: moment.trigger,
        }),
        run_hour: moment.run_hour,
        last_run_for: moment.last_run_for,
        until: moment.until,
        reach_out: triggerOf(moment.trigger)?.kind === "reach_out",
      })),
      posts,
    };
    const cited: RowRef[] = runs.runs.map((r) => ({
      kind: "broadcast",
      id: r.id,
      route: addressOf({ kind: "send", id: r.id }),
      label: r.name,
    }));
    return { data: { runs }, rows: cited, stamp: readerStamp() };
  },
};
