/**
 * Everyone's appointments, for the People list, the pools and the report: one parsed feed indexed once for everyone
 * (peopleVisits), the rows with their visits attached (withVisits), and the report's one conversion line
 * (bookingReport). One person's are person-visits.ts's.
 */
import "server-only";
import {
  bookedAfterAsk,
  type PersonRowDto,
  type PersonVisitsDto,
  type ConsultRules,
  type BookingReportDto,
  consultFirstOf,
  peopleVisitsOf,
  withVisitsOf,
  DAY_MS,
  feedMarksOf,
  seasonHorizon,
  type PoolRecord,
} from "@chanlytics/contracts";
import { recordOver } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { lazily, type Lazy } from "@/server/lazy";
import { calendarOf } from "./calendar-settings";
import { parsedFeedFor, type ParsedRead } from "./parsed-feed";
import { log } from "@/server/log";

/* ---- Everyone's appointments, for the list and the report ---- */

export interface PeopleVisits {
  calendar: { state: "ok" | "unavailable" | "none"; source: string; timezone: string };
  /** By contact id; absent without a readable calendar. */
  visits: Map<string, PersonVisitsDto>;
  bookingLink: string | null;
  /** The profile's services and its consult-first rule: which of a person's visits is a consultation (0004). */
  services: { name: string }[];
  rules: ConsultRules | null;
}

/**
 * The workspace's zone and its raw settings, handed to the calendar's lookup (calendarOf) by a caller that holds them
 * this turn, or how to read them from the turn (readers/facts.ts zoneAndSettings): asked for just where the lookup
 * would read them itself, so neither is read twice or any sooner, and a read of them that fails costs the visits, as
 * the lookup's own failure does.
 */
export type ZoneAndSettings = Lazy<{ timezone: string; config: unknown }>;

/**
 * The calendar everyone's visits are read from, before anyone's rows: its lookup (calendarOf) and its parsed feed, null
 * where the workspace names no calendar. Read apart from the rows, so a caller that reads everyone too asks for both
 * at once (campaigns/playbook-pools.ts poolReads): the feed never waited on who is in People.
 */
export interface CalendarRead {
  lookup: Awaited<ReturnType<typeof calendarOf>>;
  feed: ParsedRead | null;
  /** The record over the feed's season, joined to it (decision 0002's readers); null without it: the feed alone. */
  record: PoolRecord | null;
}

/**
 * The record over the season a feed's parse holds (seasonHorizon), as a reader joins it to the feed (contracts
 * feedWithRecord): a booking's rows, and the word a member said of each feed event, by its key and start. Null when it
 * could not be read, logged: the reader says the calendar is unavailable, as for a feed it could not read, since a visit
 * the record cancelled or a member said missed could not be told from one that stands.
 */
export async function poolRecordOf(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  now: Date,
): Promise<PoolRecord | null> {
  const season = seasonHorizon(now);
  try {
    const read = await recordOver(
      ctx.supabase,
      tenantId,
      new Date(season.from).toISOString(),
      new Date(season.to).toISOString(),
    );
    return { noted: read.noted, marks: feedMarksOf(read.feed) };
  } catch (e) {
    log.error("visits_record_read_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** The lookup, then the feed it names. `known` and `stale` as peopleVisits takes them. */
export async function calendarRead(
  ctx: RouteContext,
  tenantId: string,
  now = new Date(),
  known?: ZoneAndSettings,
  opts: { stale?: boolean } = {},
): Promise<CalendarRead> {
  const lookup = await calendarOf(ctx, tenantId, known === undefined ? undefined : await lazily(known));
  if (!lookup.url) return { lookup, feed: null, record: null };
  // The record beside the feed, not after it: the two are independent.
  const recordRead = poolRecordOf(ctx, tenantId, now);
  try {
    const feed = await parsedFeedFor(tenantId, lookup.url, lookup.timezone, now, { stale: opts.stale === true });
    return { lookup, feed, record: await recordRead };
  } catch (e) {
    log.error("calendar_parse_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return {
      lookup,
      feed: { parsed: null, at: null, reason: "not_ical", status: null, checkedAt: null },
      record: await recordRead,
    };
  }
}

/** Everyone's visits off a calendar already read: the rows indexed against its feed, once. */
export function visitsIn({ lookup, feed, record }: CalendarRead, rows: PersonRowDto[], now: Date): PeopleVisits {
  const { lostCalendar, timezone, source, bookingLink, own, profile } = lookup;
  const services = profile?.services ?? [];
  const rules = profile?.booking_rules ?? null;
  const visits = new Map<string, PersonVisitsDto>();
  if (!feed)
    return {
      calendar: { state: lostCalendar ? "unavailable" : "none", source, timezone },
      visits,
      bookingLink,
      services,
      rules,
    };
  // A record that could not be read (poolRecordOf, logged) is the calendar unavailable, as a feed is.
  if (!feed.parsed || !record)
    return { calendar: { state: "unavailable", source, timezone }, visits, bookingLink, services, rules };
  // Everyone's visits, each marked a consultation or not, by the pool's one rule (contracts peopleVisitsOf): what the
  // edge's playbook runner reads too. The record joins the feed there: a booking's visits, a cancelled one left out, a
  // member's kept or missed on each (0002's readers).
  const marked = peopleVisitsOf(
    feed.parsed.items,
    rows,
    { timezone, source, own, services, rules, record },
    now.getTime(),
  );
  return { calendar: { state: "ok", source, timezone }, visits: marked, bookingLink, services, rules };
}

/**
 * The next and last appointment of everyone on the list, from one parsed
 * feed indexed once — the number first, the whole name second — so a list
 * of hundreds costs one read of the calendar, not hundreds. `known`: the
 * zone and the settings the turn holds (ZoneAndSettings), which the lookup
 * then reads neither of. `stale`: the calendar's last good read may answer
 * while a newer one is fetched behind it (openings.ts loadFeed), for a reader
 * that says what was booked and decides nothing from it: never a pool that
 * chooses who is sent something.
 */
async function peopleVisits(
  ctx: RouteContext,
  tenantId: string,
  rows: PersonRowDto[],
  now = new Date(),
  known?: ZoneAndSettings,
  opts: { stale?: boolean } = {},
): Promise<PeopleVisits> {
  return visitsIn(await calendarRead(ctx, tenantId, now, known, opts), rows, now);
}

/**
 * The rows with their appointments attached, the way the People list and the assistant read them. `known`: the zone
 * and the settings the turn holds, or how to read them from it (ZoneAndSettings), so the calendar's lookup reads
 * neither again; a read of them that fails costs the visits, never the list. `stale` as peopleVisits takes it.
 */
export async function withVisits(
  ctx: RouteContext,
  tenantId: string,
  rows: PersonRowDto[],
  now = new Date(),
  known?: ZoneAndSettings,
  opts: { stale?: boolean } = {},
): Promise<{
  people: PersonRowDto[];
  calendar: PeopleVisits["calendar"];
  booking_link: string | null;
  /** The profile lists a consult-first service (0004): the Consultations list can be counted only then. */
  consult_first: boolean;
}> {
  const pv = await peopleVisits(ctx, tenantId, rows, now, known, opts).catch((e: unknown) => {
    log.error("people_visits_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    return null;
  });
  if (!pv)
    return {
      people: rows.map((r) => ({ ...r, visits: null })),
      calendar: { state: "none", source: "your calendar", timezone: "UTC" },
      booking_link: null,
      consult_first: false,
    };
  // Each visit already says whether it is a consultation (0004): peopleVisits marked it (contracts peopleVisitsOf), and
  // they are attached by the pool's one rule (withVisitsOf), as the Playbooks page and the edge's run attach them.
  // The visits near today (`near`) are a run's to read (the Playbooks page and the edge read peopleVisits), never the
  // list's: a person with several would carry them to the browser, which reads none.
  const listed = new Map([...pv.visits].map(([id, v]) => [id, { ...v, near: undefined }]));
  return {
    people: withVisitsOf(rows, listed, pv.calendar),
    calendar: pv.calendar,
    booking_link: pv.bookingLink,
    consult_first: consultFirstOf(pv.rules),
  };
}

/**
 * Whether a person's visits answer a moment they reached out at: one upcoming, or one held since (contracts
 * bookedAfterAsk, the one rule). The booking line and the booking link's count both ask it, so a person is "booked"
 * the same way in each.
 */
function bookedSince(visits: PersonVisitsDto | undefined, askedMs: number): boolean {
  return bookedAfterAsk(visits, askedMs);
}

/**
 * Asked, then booked: of the people who wrote or called in the period, how
 * many have an appointment on the calendar — upcoming, or held since they
 * reached out. The one conversion line Reports carries. `known`: the zone and
 * the raw settings a caller read this turn, so the calendar's lookup reads
 * neither again (calendarOf).
 */
export async function bookingReport(
  ctx: RouteContext,
  tenantId: string,
  rows: PersonRowDto[],
  days: number,
  now = new Date(),
  known?: { timezone: string; config: unknown },
): Promise<BookingReportDto> {
  const pv = await peopleVisits(ctx, tenantId, rows, now, known);
  const nowMs = now.getTime();
  const since = nowMs - days * DAY_MS;
  let asked = 0;
  let booked = 0;
  for (const r of rows) {
    // Their message, or the call they placed — never a call the owner made.
    const cands = [r.last_inbound_at, r.last_inbound_call_at ?? null]
      .map((x) => (x ? Date.parse(x) : NaN))
      .filter((x) => Number.isFinite(x));
    if (!cands.length) continue;
    const askedMs = Math.max(...cands);
    if (askedMs < since) continue;
    asked += 1;
    if (bookedSince(pv.visits.get(r.id), askedMs)) booked += 1;
  }
  return { calendar: pv.calendar.state, days, asked, booked };
}

/**
 * The booking link: of the people sent it, how many have booked since, by the rule "asked, then booked" counts by
 * (bookedSince), the link's moment standing where their message does. `rows` is People as read, or the part of it the
 * links name: a person it no longer holds (erased, merged) has no visit to find and is not counted. `booked` is 0 where
 * the calendar cannot say (`calendar` "none" or "unavailable"), which the caller words as no number, never as zero.
 * `known` as bookingReport takes it.
 */
export async function linksBooked(
  ctx: RouteContext,
  tenantId: string,
  rows: PersonRowDto[],
  links: { c: string; at: string }[],
  now = new Date(),
  known?: { timezone: string; config: unknown },
): Promise<{ calendar: PeopleVisits["calendar"]["state"]; booked: number }> {
  const pv = await peopleVisits(ctx, tenantId, rows, now, known);
  const booked = links.filter((l) => bookedSince(pv.visits.get(l.c), Date.parse(l.at))).length;
  return { calendar: pv.calendar.state, booked };
}
