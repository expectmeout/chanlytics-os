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
} from "@chanlytics/contracts";
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
 * The next and last appointment of everyone on the list, from one parsed
 * feed indexed once — the number first, the whole name second — so a list
 * of hundreds costs one read of the calendar, not hundreds. `known`: the
 * zone and the settings the turn holds (ZoneAndSettings), which the lookup
 * then reads neither of.
 */
export async function peopleVisits(
  ctx: RouteContext,
  tenantId: string,
  rows: PersonRowDto[],
  now = new Date(),
  known?: ZoneAndSettings,
): Promise<PeopleVisits> {
  const { url, lostCalendar, timezone, source, bookingLink, own, profile } = await calendarOf(
    ctx,
    tenantId,
    known === undefined ? undefined : await lazily(known),
  );
  const services = profile?.services ?? [];
  const rules = profile?.booking_rules ?? null;
  const visits = new Map<string, PersonVisitsDto>();
  if (!url)
    return {
      calendar: { state: lostCalendar ? "unavailable" : "none", source, timezone },
      visits,
      bookingLink,
      services,
      rules,
    };
  let feed: ParsedRead;
  try {
    feed = await parsedFeedFor(tenantId, url, timezone, now);
  } catch (e) {
    log.error("calendar_parse_failed", { tenant: tenantId, error: e instanceof Error ? e.message : String(e) });
    feed = { parsed: null, at: null, reason: "not_ical", status: null, checkedAt: null };
  }
  if (!feed.parsed)
    return { calendar: { state: "unavailable", source, timezone }, visits, bookingLink, services, rules };
  // Everyone's visits, each marked a consultation or not, by the pool's one rule (contracts peopleVisitsOf): what the
  // edge's playbook runner reads too.
  const marked = peopleVisitsOf(feed.parsed.items, rows, { timezone, source, own, services, rules }, now.getTime());
  return { calendar: { state: "ok", source, timezone }, visits: marked, bookingLink, services, rules };
}

/**
 * The rows with their appointments attached, the way the People list and the assistant read them. `known`: the zone
 * and the settings the turn holds, or how to read them from it (ZoneAndSettings), so the calendar's lookup reads
 * neither again; a read of them that fails costs the visits, never the list.
 */
export async function withVisits(
  ctx: RouteContext,
  tenantId: string,
  rows: PersonRowDto[],
  now = new Date(),
  known?: ZoneAndSettings,
): Promise<{
  people: PersonRowDto[];
  calendar: PeopleVisits["calendar"];
  booking_link: string | null;
  /** The profile lists a consult-first service (0004): the Consultations list can be counted only then. */
  consult_first: boolean;
}> {
  const pv = await peopleVisits(ctx, tenantId, rows, now, known).catch((e: unknown) => {
    log.error("people_visits_failed", { tenant: tenantId, error: e instanceof Error ? e.message : String(e) });
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
  return {
    people: withVisitsOf(rows, pv.visits, pv.calendar),
    calendar: pv.calendar,
    booking_link: pv.bookingLink,
    consult_first: consultFirstOf(pv.rules),
  };
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
    const v = pv.visits.get(r.id);
    if (
      v &&
      bookedAfterAsk(
        {
          next: v.next
            ? { ...v.next, start: Date.parse(v.next.start), end: Date.parse(v.next.end), allDay: v.next.all_day }
            : null,
          last: v.last
            ? { ...v.last, start: Date.parse(v.last.start), end: Date.parse(v.last.end), allDay: v.last.all_day }
            : null,
        },
        askedMs,
      )
    )
      booked += 1;
  }
  return { calendar: pv.calendar.state, days, asked, booked };
}
