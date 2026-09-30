/**
 * The board's week: its span by the business's clock, the feed's items by day, the one read for a span
 * (calendarSources), the week assembled from it (weekFrom), and the three in turn (calendarWeek). The people an
 * owner's read puts in People are people-seen.ts's; the feed's parse is parsed-feed.ts's.
 */
import "server-only";
import {
  eventText,
  extractContacts,
  feedProblemWords,
  feedSourceLabel,
  freeWindows,
  guessName,
  isDayKey,
  isConsultationTitle,
  consultServiceOf,
  matchPerson,
  mondayOf,
  shiftKey,
  zoneMidnight,
  type BookingRules,
  type BusinessProfile,
  type CalendarDayDto,
  type CalendarItemDto,
  type CalendarWeekDto,
  type FeedItem,
  type PersonLike,
  type ConsultRules,
  type ParsedFeed,
  needsConsultation,
  ownAddressesOf,
  personLikeOf,
  type OwnAddresses,
} from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { tenantFacts } from "@/server/tenant";
import { everyone } from "@/server/people/people";
import { readSettings } from "./calendar-settings";
import { parsedFeedFor, type ParsedRead } from "./parsed-feed";
import { addPeopleSeen } from "./people-seen";
import { log } from "@/server/log";

/**
 * The calendar as the receptionist reads it, for one span of days.
 *
 * The feed is fetched server-side (its address never reaches the browser)
 * with the same short cache the assistant's openings use; the taken blocks,
 * the hours, the closures and the booking rules go through the same pure
 * functions the phone tool computes with, so the windows this page draws are
 * the windows a caller is offered. Titles are the owner's own calendar
 * words; a title that carries a person's name links to their profile.
 */
/** Nine weeks: the window a page loads around the day it looks at. */
const MAX_DAYS = 63;
/**
 * The most items one day carries to the browser. A board draws a day in a
 * column; a hundred blocks in it is already unreadable, and a feed that
 * names a thousand is a shared calendar, not a salon's. The rest are counted
 * and said, never silently dropped.
 */
export const MAX_ITEMS_PER_DAY = 100;

function spanFor(from: string | null, days: number, tz: string, now: Date): { from: string; days: number } {
  const todayKey = ((): string => {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    return f.format(now);
  })();
  const start = isDayKey(from) ? from : mondayOf(todayKey);
  return { from: start, days: Math.min(MAX_DAYS, Math.max(1, Math.round(days) || 7)) };
}

/** People as the matcher wants them: a human-given name (never a phone made words), the E.164, the address (00125), and the thread a link is texted into when they have one. */
/** A People row as the calendar matches it: contracts' one rule (audience-pool.ts personLikeOf). */
export const personLike = personLikeOf;

/**
 * The feed's items by day, as the board draws them: who each is for, what it carried, and whether it is a consultation
 * (0008), by the one rule People's visits are marked by (withVisits): its title says so, or names a service the
 * workspace's rules say needs a consultation first. `consult` is the profile's services and those rules.
 */
export function itemsToDays(
  items: FeedItem[],
  from: string,
  days: number,
  tz: string,
  people: PersonLike[],
  own: OwnAddresses,
  services: string[],
  consult: { services: readonly { name: string }[]; rules: ConsultRules | null },
): { days: Array<Pick<CalendarDayDto, "key" | "items">>; dropped: number } {
  const out: Array<Pick<CalendarDayDto, "key" | "items">> = [];
  let dropped = 0;
  for (let i = 0; i < days; i++) {
    const key = shiftKey(from, i);
    const dayStart = zoneMidnight(tz, key);
    const dayEnd = zoneMidnight(tz, shiftKey(key, 1));
    const inDay = items.filter((it) => it.end > dayStart && it.start < dayEnd);
    if (inDay.length > MAX_ITEMS_PER_DAY) dropped += inDay.length - MAX_ITEMS_PER_DAY;
    const rows: CalendarItemDto[] = inDay.slice(0, MAX_ITEMS_PER_DAY).map((it, n) => {
      const c = extractContacts(it, own);
      return {
        id: `${it.uid ?? "ev"}:${it.start}:${n}`,
        start: new Date(it.start).toISOString(),
        end: new Date(it.end).toISOString(),
        title: it.title,
        all_day: it.allDay,
        person: matchPerson(it, people, own),
        description: eventText(it.description),
        location: it.location,
        contacts: { phones: c.phones, emails: c.emails },
        guess: guessName(it, services),
        consultation: isConsultationTitle(it.title, consult.services, consult.rules),
        consult_service: consultServiceOf(it.title, consult.services, consult.rules),
      };
    });
    out.push({ key, items: rows });
  }
  return { days: out, dropped };
}

/**
 * What the board's week is read from, for one span: the workspace's zone and the span by its clock, its settings, the
 * feed parsed once, the profile's services and everyone in People as the matcher wants them. `week` is the answer
 * already whole -- no calendar, or one that could not be read -- and null when the feed was read, which is then
 * `parsed`; the services' names and People are read only then, and are empty beside a whole week. It carries neither
 * the feed's address nor the raw settings -- only the calendar's name and the business's own addresses, taken from
 * them in calendarSources -- and it is still never an answer: only what weekFrom assembles from it is.
 */
export type CalendarSources = {
  timezone: string;
  span: { from: string; days: number };
  /** The calendar's name ("Google Calendar", "your calendar"), as the board says it: never its address. */
  source: string;
  /** The business's own addresses (never anybody's visit), as the board matches around them. */
  ownAddresses: OwnAddresses;
  profile: BusinessProfile | null;
  rules: BookingRules | null;
  base: CalendarWeekDto;
  serviceNames: string[];
  people: PersonLike[];
} & (
  | { week: CalendarWeekDto; feed: ParsedRead | null; parsed: null }
  | { week: null; feed: ParsedRead; parsed: ParsedFeed }
);

/**
 * The calendar's one read for a span, and nothing written (D7): calendarWeek's reads, in its order, up to the point an
 * owner's read would put the feed's people in People. The zone and the settings are read here unless a caller that
 * read them this turn hands them in (readers/calendar.ts), so a turn reads the tenant once. What the board shows
 * follows from this alone (weekFrom); a read that adds people does so between the two (calendarWeek, the calendar
 * route). Takes only the client it reads with, as calendarWeek does.
 */
export async function calendarSources(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  by: { from: string | null; days: number },
  now: Date,
  opts: { fresh?: boolean; timezone?: string; config?: unknown } = {},
): Promise<CalendarSources> {
  // The zone and the settings: handed in by a caller that read them this turn (readers/calendar.ts), else read here.
  const timezone = opts.timezone ?? (await tenantFacts(ctx.supabase, tenantId)).timezone;
  const span = spanFor(by.from, by.days, timezone, now);
  let raw = opts.config;
  if (raw === undefined) {
    const { data: row, error } = await ctx.supabase
      .from("tenant_config")
      .select("config")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    raw = row?.config ?? null;
  }
  const { cfg, lostCalendar } = readSettings(tenantId, raw);
  const url = cfg?.calendar?.ical_url ?? null;
  const profile = cfg?.brain?.profile ?? null;
  const rules: BookingRules | null = profile?.booking_rules ?? null;
  const hours = profile?.hours ?? null;
  const closures = profile?.closures ?? [];
  const to = shiftKey(span.from, span.days - 1);

  const base: CalendarWeekDto = {
    timezone,
    from: span.from,
    to,
    feed: {
      present: !!url || lostCalendar,
      source: feedSourceLabel(url),
      state: url || lostCalendar ? "unavailable" : "none",
      read_at: null,
      checked_at: null,
      events: 0,
      recurring_expanded: 0,
      skipped_recurring: 0,
      reason: lostCalendar ? "settings" : null,
      status: null,
      problem: lostCalendar ? feedProblemWords("settings") : null,
      stale: false,
      dropped: 0,
    },
    hours,
    closures,
    rules,
    // The services as Settings keeps them: how long each takes (the assistant
    // sizes windows by it) and which need a consultation first.
    services: (profile?.services ?? []).map((s) => ({
      name: s.name,
      duration_min: typeof s.duration_min === "number" ? s.duration_min : null,
      consult_first: needsConsultation(s.name, profile?.booking_rules),
    })),
    booking_link: cfg?.brain?.booking_link ?? null,
    // No readable calendar: the receptionist never names an open time.
    next_opening: null,
    days: Array.from({ length: span.days }, (_, i) => ({ key: shiftKey(span.from, i), items: [], windows: [] })),
  };
  // What the board needs of the address and the settings, and not them: the calendar's name, the business's own.
  const read = {
    timezone,
    span,
    source: feedSourceLabel(url),
    ownAddresses: ownAddressesOf(cfg),
    profile,
    rules,
    base,
  };
  if (!url) return { ...read, feed: null, parsed: null, serviceNames: [], people: [], week: base };

  // One parse per fetch, shared with the profile, the People list and the
  // report. Its horizon — ninety days either side — covers any span the page
  // asks for and the openings' reach from now, so the windows are the
  // receptionist's own, never computed from a feed cut short. A fresh read is the board's Refresh (C2).
  let feed: ParsedRead;
  try {
    feed = await parsedFeedFor(tenantId, url, timezone, now, { fresh: !!opts.fresh });
  } catch (e) {
    log.error("calendar_parse_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    feed = { parsed: null, at: null, reason: "not_ical", status: null, checkedAt: null };
  }
  // Nothing readable, ever: the board says why, in the words the preview uses.
  if (!feed.parsed)
    return {
      ...read,
      feed,
      parsed: null,
      serviceNames: [],
      people: [],
      week: {
        ...base,
        feed: {
          ...base.feed,
          checked_at: feed.checkedAt === null ? null : new Date(feed.checkedAt).toISOString(),
          reason: feed.reason,
          status: feed.status,
          problem: feedProblemWords(feed.reason, feed.status),
        },
      },
    };
  const parsed = feed.parsed;
  const serviceNames = (profile?.services ?? []).map((s) => s.name);
  // Everyone, not the first thousand: past it, an appointment of a known person linked to nobody on the board, and
  // an owner's read asked the door for them again.
  const people = (await everyone(ctx, tenantId).catch(() => [])).map(personLike);
  return { ...read, feed, parsed, serviceNames, people, week: null };
}

/**
 * The board's week from what was read, a pure assembly: the feed's items by day, each matched to `people`, the windows
 * the receptionist would offer from `now`, and the first of them. `people` is the read's own, or those with the people
 * an owner's read just put in People. A week the read already answered whole is that week. Reads nothing, writes
 * nothing, and changes nothing it is handed.
 */
export function weekFrom(s: CalendarSources, people: PersonLike[], now: Date): CalendarWeekDto {
  if (s.week) return s.week;
  const { timezone, span, source, ownAddresses, profile, rules, base, feed, parsed, serviceNames } = s;
  const { days, dropped } = itemsToDays(
    parsed.items,
    span.from,
    span.days,
    timezone,
    people,
    ownAddresses,
    serviceNames,
    { services: profile?.services ?? [], rules },
  );
  const openings = profile
    ? freeWindows({ hours: profile.hours, closures: profile.closures, tz: timezone, busy: parsed.busy, rules, now })
    : [];
  const windowsOf = new Map(openings.map((o) => [o.key, o.windows]));
  // The receptionist's next open time from now, whatever span the page asked for: the first of every time it would
  // offer. The page worked it out from the span it had loaded, so a board on December had none to name (C1).
  const first = openings.find((o) => o.windows.length)?.windows[0] ?? null;
  return {
    ...base,
    next_opening: first ? { start: new Date(first.start).toISOString(), end: new Date(first.end).toISOString() } : null,
    // A reason beside "ok" means the latest try failed and this is the last good read, said so on the chip.
    feed: {
      present: true,
      source,
      state: "ok",
      read_at: feed.at === null ? null : new Date(feed.at).toISOString(),
      checked_at: feed.checkedAt === null ? null : new Date(feed.checkedAt).toISOString(),
      events: parsed.events,
      recurring_expanded: parsed.recurringExpanded,
      skipped_recurring: parsed.skippedRecurring,
      reason: feed.reason,
      status: feed.status,
      problem: feedProblemWords(feed.reason, feed.status),
      stale: feed.reason !== null,
      dropped,
    },
    days: days.map((d) => ({
      ...d,
      windows: (windowsOf.get(d.key) ?? []).map((w) => ({
        start: new Date(w.start).toISOString(),
        end: new Date(w.end).toISOString(),
      })),
    })),
  };
}

/**
 * Takes only the client it reads with, not a whole RouteContext: Setup's
 * assembly calls this for a workspace that is not the caller's own -- the back
 * office reading somebody else's -- and there is no request behind that.
 *
 * The read (calendarSources), then, when the caller may act, the people the feed names put in People, then the board
 * assembled (weekFrom): one clock for the span, the people and the windows. The calendar route takes the same three
 * steps around its reader.
 */
export async function calendarWeek(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  by: { from: string | null; days: number },
  now = new Date(),
  opts: { canAct?: boolean; fresh?: boolean } = {},
): Promise<CalendarWeekDto> {
  const s = await calendarSources(ctx, tenantId, by, now, { fresh: !!opts.fresh });
  if (s.week) return s.week;
  // A copy: the read's own list is never changed.
  const people = [...s.people];
  // The people this feed names are put in People here, so the board an
  // owner is looking at already links to them; the hourly sweep does the
  // same for everyone else, and for a feed nobody opens.
  if (opts.canAct)
    people.push(
      ...(await addPeopleSeen(ctx, tenantId, s.parsed.items, s.serviceNames, people, now).catch((e: unknown) => {
        log.error("calendar_people_seen_failed", {
          tenant_id: tenantId,
          error: e instanceof Error ? e.message : String(e),
        });
        return [];
      })),
    );
  return weekFrom(s, people, now);
}
