/**
 * One person's appointments, for their profile: the next, the last and the timeline, from the feed the board reads
 * (parsed-feed.ts) and the calendar's lookup the People list shares (calendar-settings.ts).
 */
import "server-only";
import {
  indexFeed,
  toVisitDto,
  type PersonLike,
  type PersonVisitsDto,
  type VisitDto,
  allVisitsIn,
  visitsIn,
} from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { calendarOf } from "./calendar-settings";
import { parsedFeedFor, type ParsedRead } from "./parsed-feed";
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
      log.error("calendar_parse_failed", { tenant: tenantId, error: e instanceof Error ? e.message : String(e) });
      return { parsed: null, at: null, reason: "not_ical", status: null, checkedAt: null };
    }
  });
  const [{ url, lostCalendar, timezone, source, own }, feed, person] = await Promise.all([calendar, feedRead, who]);
  // No calendar: nothing to say about this person's visits. A calendar the settings hid: say that, not nothing.
  if (!url) return lostCalendar ? { timezone, source, state: "unavailable", next: null, last: null } : null;
  if (!person) return null;
  if (!feed?.parsed) return { timezone, source, state: "unavailable", next: null, last: null };
  const index = indexFeed(feed.parsed.items, own);
  const v = visitsIn(index, person, now.getTime());
  // The timeline wants them all; a season either side is what the parse holds.
  const all = allVisitsIn(index, person)
    .map((x) => toVisitDto(x) as VisitDto)
    .slice(-60);
  return { timezone, source, state: "ok", next: toVisitDto(v.next), last: toVisitDto(v.last), all };
}
