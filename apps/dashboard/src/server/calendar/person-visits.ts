/**
 * One person's appointments, for their profile: the next, the last and the timeline, from the feed the board reads
 * (parsed-feed.ts) and the calendar's lookup the People list shares (calendar-settings.ts).
 */
import "server-only";
import {
  earlierVisitsOf,
  indexFeed,
  seasonHorizon,
  toVisitDto,
  type PersonLike,
  type PersonVisitsDto,
  type VisitDto,
  allVisitsIn,
  visitsIn,
  feedWithRecord,
} from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { calendarOf } from "./calendar-settings";
import { parsedFeedFor, type ParsedRead } from "./parsed-feed";
import { poolRecordOf } from "./people-visits";
import { earlierVisitRows } from "@chanlytics/db";
import { log } from "@/server/log";

/* ---- One person's appointments, for their profile ---- */

/**
 * The next and last appointment for one person, read from the same feed
 * with the same match the board uses. Null when the workspace has no
 * calendar; "unavailable" when it has one that could not be read. Ninety
 * days back and sixty ahead: a last visit worth naming, and a next one
 * booked past the receptionist's own offering window.
 *
 * `who` may still be on its way (the profile's row, read in the same round): the feed does not need to know who they
 * are, so it is asked for as soon as the calendar's address is known, and the two meet here. Null for nobody. The feed
 * may be the last good read while a new one is fetched (`stale`): a profile's next visit, never an opening offered.
 */
export async function personVisits(
  ctx: RouteContext,
  tenantId: string,
  who: PersonLike | PromiseLike<PersonLike | null>,
  now = new Date(),
): Promise<PersonVisitsDto | null> {
  const calendar = calendarOf(ctx, tenantId);
  const feedRead = calendar.then(async ({ url, timezone }): Promise<ParsedRead | null> => {
    if (!url) return null;
    try {
      return await parsedFeedFor(tenantId, url, timezone, now, { stale: true });
    } catch (e) {
      log.error("calendar_parse_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
      return { parsed: null, at: null, reason: "not_ical", status: null, checkedAt: null };
    }
  });
  // The record beside the feed (0002's readers): a booking's visits join theirs, a cancelled one leaves, a word rides.
  const recordRead = calendar.then(({ url }) => (url ? poolRecordOf(ctx, tenantId, now) : null));
  const earlierRead = earlierRowsOf(ctx, tenantId, calendar, who, now);
  const [{ url, lostCalendar, timezone, source, own }, feed, person, record, earlierRows] = await Promise.all([
    calendar,
    feedRead,
    who,
    recordRead,
    earlierRead,
  ]);
  // No calendar: nothing to say about this person's visits. A calendar the settings hid: say that, not nothing.
  if (!url) return lostCalendar ? { timezone, source, state: "unavailable", next: null, last: null } : null;
  if (!person) return null;
  // A record that could not be read is the calendar unavailable too: a visit it cancelled, or a member said missed, could
  // not be told from one that stands.
  if (!feed?.parsed || !record) return { timezone, source, state: "unavailable", next: null, last: null };
  const index = indexFeed(feedWithRecord(feed.parsed.items, record, own), own);
  const v = visitsIn(index, person, now.getTime());
  // The timeline wants them all; a season either side is what the parse holds.
  const all = allVisitsIn(index, person)
    .map((x) => toVisitDto(x) as VisitDto)
    .slice(-60);
  // The record's count of theirs from before the season (R7), leaving out any row the season carries.
  const earlier = earlierRows
    ? earlierVisitsOf(earlierRows, new Set(all.flatMap((x) => (x.record_id ? [x.record_id] : []))))
    : null;
  return {
    timezone,
    source,
    state: "ok",
    next: toVisitDto(v.next),
    last: toVisitDto(v.last),
    missed: toVisitDto(v.missed ?? null),
    all,
    ...(earlier ? { earlier } : {}),
  };
}

/**
 * The record's rows of one person from before the season the feed's read covers (packages/db earlierVisitRows), started
 * in the same round as the rest. Never fatal: a failed or capped read leaves the count to the season's alone, said as
 * "Last 90 days", never the calendar unavailable.
 */
function earlierRowsOf(
  ctx: RouteContext,
  tenantId: string,
  calendar: ReturnType<typeof calendarOf>,
  who: PersonLike | PromiseLike<PersonLike | null>,
  now: Date,
) {
  return Promise.all([calendar, who]).then(async ([{ url }, person]) => {
    if (!url || !person) return null;
    try {
      const read = await earlierVisitRows(
        ctx.supabase,
        tenantId,
        { id: person.id, phone: person.phone, email: person.email },
        new Date(seasonHorizon(now).from).toISOString(),
      );
      return read.capped ? null : read.rows;
    } catch (e) {
      log.error("person_earlier_visits_failed", {
        tenant_id: tenantId,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  });
}
