/** Week: week. */

import "server-only";
import {
  feedProblemWords,
  feedSourceLabel,
  freeWindows,
  shiftKey,
  zoneMidnight,
  type BookingRules,
  type BusinessProfile,
  type CalendarItemDto,
  type VisitOriginDto,
  type CalendarWeekDto,
  type PersonLike,
  type ParsedFeed,
  needsConsultation,
  ownAddressesOf,
  withoutVisitsRowsDraw,
  daysWithAppointments,
  busyOfAppointments,
  offeringHorizon,
  BOOKING_DEFAULTS,
  type AppointmentLike,
  type BusyBlock,
  type CalendarFeedDto,
  type CalendarNoticesDto,
  type PersonRowDto,
  type TenantConfig,
  calendarPersonFactsOf,
  type FeedMark,
  calendarFeedKeyOf,
  mailboxCalendarOf,
} from "@chanlytics/contracts";
import { listVisitOrigins } from "@chanlytics/db/calendar";
import type { MailboxRow } from "@chanlytics/db/email";
import type { RouteContext } from "@/server/shared/with-route";
import { getTenantFacts } from "@/server/shared/tenant";
import { listEveryone } from "@/server/people/people";
import { readSettings } from "../settings";
import { getStoredConfig } from "@/server/workspace/config-row";
import { getParsedFeed, type ParsedRead } from "../parsed-feed";
import { getBoardVisits, findPoolRecord } from "../people-visits";
import { recordBusy } from "../record-busy";
import { log } from "@/server/shared/log";
import {
  itemsToDays,
  noticesHealth,
  personLike,
  recordOverSpan,
  spanFor,
  type CalendarSources,
  unreadFeed,
} from "./items";
import type { TenantId } from "@chanlytics/contracts";

/** The week before anything is read: the settings' own facts, and a feed that says why it is not read yet. */
function weekBeforeReading(
  timezone: string,
  span: { from: string; days: number },
  to: string,
  cfg: TenantConfig | null,
  url: string | null,
  lostCalendar: boolean,
): CalendarWeekDto {
  const profile = cfg?.brain?.profile ?? null;
  return {
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
      by_hand: !!cfg?.bookings?.by_hand,
      granted: !!mailboxCalendarOf(url),
    },
    hours: profile?.hours ?? null,
    closures: profile?.closures ?? [],
    rules: profile?.booking_rules ?? null,
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
}

/**
 * The calendar's one read for a span, and nothing written (D7): getCalendarWeek's reads, in its order, up to the point an
 * owner's read would put the feed's people in People. The zone and the settings are read here unless a caller that
 * read them this turn hands them in (readers/calendar.ts), so a turn reads the tenant once. What the board shows
 * follows from this alone (weekFrom); a read that adds people does so between the two (getCalendarWeek, the calendar
 * route). Takes only the client it reads with, as getCalendarWeek does. `mailbox`: how a caller that reads the
 * workspace's mailbox for more than the notices' line asks for it (Setup), so it is asked once.
 */
export async function getCalendarSources(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  by: { from: string | null; days: number; around?: "today" | null },
  now: Date,
  opts: {
    fresh?: boolean;
    timezone?: string;
    config?: unknown;
    feedOnly?: boolean;
    mailbox?: () => Promise<MailboxRow | null>;
  } = {},
): Promise<CalendarSources> {
  // The zone and the settings: handed in by a caller that read them this turn (readers/calendar.ts), else read here.
  const timezone = opts.timezone ?? (await getTenantFacts(ctx.supabase, tenantId)).timezone;
  const span = spanFor(by.from, by.days, timezone, now, by.around ?? null);
  // The settings whole, the feed's address with them, for any member: the server reads the feed (config-row.ts).
  const raw = opts.config === undefined ? await getStoredConfig(ctx.supabase, tenantId) : opts.config;
  const { cfg, lostCalendar } = readSettings(tenantId, raw);
  // The grant's calendar where one is read, else the link (contracts calendarFeedKeyOf).
  const url = calendarFeedKeyOf(cfg);
  const profile = cfg?.brain?.profile ?? null;
  const rules: BookingRules | null = profile?.booking_rules ?? null;
  const to = shiftKey(span.from, span.days - 1);

  const base = weekBeforeReading(timezone, span, to, cfg, url, lostCalendar);
  // A caller that asks only where the calendar stands (`feedOnly`: Setup's row) is read no visit of the record, and
  // the notices' health only where the owner named a tool: without one no email was ever read as a booking, so there
  // is nothing to ask, and a workspace that never set this up costs Setup no query.
  const named = { tool: cfg?.bookings?.tool ?? null, name: cfg?.brain?.business_name ?? null };
  const { rows, marks, leads, notices } = !opts.feedOnly
    ? await recordOverSpan(ctx, tenantId, timezone, span.from, to, named)
    : named.tool
      ? { ...NO_RECORD, notices: await noticesHealth(ctx, tenantId, named, false, opts.mailbox) }
      : NO_RECORD;
  // The visits the notices became over the span: a cancelled one aside, and a tool's request too, which is no visit yet
  // (decision 0002) however the board draws its time.
  base.feed.notices = {
    ...notices,
    count: rows.filter((r) => r.status !== "cancelled" && r.status !== "proposed").length,
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
    rows,
    marks,
  };
  const [sources, origins] = await Promise.all([
    withFeedAndPeople(ctx, tenantId, read, url, profile, now, {
      fresh: !!opts.fresh,
      feedOnly: !!opts.feedOnly,
    }),
    originsOf(ctx, tenantId, leads),
  ]);
  // Beside a feed that reads, the record's taken time, which the open times subtract; never for a feed-only read.
  const taken = sources.parsed && !opts.feedOnly ? await takenBesideTheFeed(ctx, tenantId, read, now) : [];
  return { ...sources, taken, origins };
}

/** A read that asks nothing of the record: no rows over the span, no notice's health line, no address. */
const NO_RECORD: {
  rows: AppointmentLike[];
  marks: Map<string, FeedMark>;
  leads: Map<string, string>;
  notices: Omit<CalendarNoticesDto, "count">;
} = {
  rows: [],
  marks: new Map(),
  leads: new Map(),
  notices: { tool: null, address: null, last_at: null, held: 0, held_list: [], forwarding: null },
};

/**
 * Where each visit's person came from, by the record row's id: the leads the rows name, read once each (listVisitOrigins),
 * no query where none names one. A read that fails is no origin and a logged line, never a board that fails to draw.
 */
async function originsOf(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  leads: ReadonlyMap<string, string>,
): Promise<Map<string, VisitOriginDto>> {
  const out = new Map<string, VisitOriginDto>();
  if (!leads.size) return out;
  const rows = await listVisitOrigins(ctx.supabase, tenantId, [...leads.values()]).catch((e: unknown) => {
    log.error("calendar_origins_read_failed", {
      tenant_id: tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  });
  const byLead = new Map(
    rows.map((r) => [
      r.lead_id,
      {
        lead: { id: r.lead_id, name: r.lead_name },
        sequence: r.sequence_id && r.sequence_name ? { id: r.sequence_id, name: r.sequence_name } : null,
      },
    ]),
  );
  for (const [visit, lead] of leads) {
    const origin = byLead.get(lead);
    if (origin) out.set(visit, origin);
  }
  return out;
}

/**
 * What calendarSources reads once the settings are known: the feed, when there is an address, and everyone in People.
 * A read that asks only where the calendar stands (`feedOnly`) reads nobody: its row names no one, and every Setup
 * and Connections of a workspace with a calendar link read all of People to say whether the link reads (9 Oct 2026).
 */
async function withFeedAndPeople(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  read: Omit<CalendarSources, "feed" | "parsed" | "serviceNames" | "people" | "book" | "firsts" | "taken" | "origins">,
  url: string | null,
  profile: BusinessProfile | null,
  now: Date,
  { fresh, feedOnly }: { fresh: boolean; feedOnly: boolean },
): Promise<Omit<CalendarSources, "taken">> {
  const { timezone, rows } = read;
  // Everyone in People is read beside the feed, not after it: the two are independent, and a board whose feed is in the
  // few minutes' cache waited on this read alone. Begun only once there is something to match against (a workspace
  // with no calendar and no rows reads nobody), and its failure is an empty list, as it was, so a read nobody awaits
  // settles quietly.
  const everyoneRead: Promise<PersonRowDto[]> =
    !feedOnly && (url || rows.length) ? listEveryone(ctx, tenantId).catch(() => []) : Promise.resolve([]);
  // The record over the season beside them, where a feed is read: each person's visits join it (findPoolRecord, which
  // logs a failure and answers null), so the board says when someone was last in.
  const recordRead = !feedOnly && url ? findPoolRecord(ctx, tenantId, now) : Promise.resolve(null);
  // The matcher's people and the rows they were made of, from the one read, each with its visits where the feed parsed.
  const people = async (parsed: ParsedFeed | null): Promise<Pick<CalendarSources, "people" | "book" | "firsts">> => {
    const all = await everyoneRead;
    const pool = { timezone, source: read.source, own: read.ownAddresses, services: profile?.services ?? [] };
    const seen = parsed
      ? await getBoardVisits(
          ctx,
          tenantId,
          all,
          parsed.items,
          { ...pool, rules: read.rules, record: await recordRead },
          now,
        )
      : { rows: all, firsts: new Set<string>() };
    return { people: all.map(personLike), book: new Map(seen.rows.map((r) => [r.id, r])), firsts: seen.firsts };
  };
  if (!url) return { ...read, feed: null, parsed: null, serviceNames: [], ...(await people(null)) };

  // One parse per fetch, shared with the profile, the People list and the
  // report. Its horizon — ninety days either side — covers any span the page
  // asks for and the openings' reach from now, so the windows are the
  // receptionist's own, never computed from a feed cut short. A fresh read is the board's Refresh (C2).
  let feed: ParsedRead;
  try {
    feed = await getParsedFeed(tenantId, url, timezone, now, { fresh });
  } catch (e) {
    log.error("calendar_parse_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    feed = { parsed: null, at: null, reason: "not_ical", status: null, checkedAt: null };
  }
  // Nothing readable, ever: the board says why, in the words the preview uses; the record's rows are drawn all the same.
  if (!feed.parsed) return { ...read, feed, parsed: null, serviceNames: [], ...(await people(null)) };
  const serviceNames = (profile?.services ?? []).map((s) => s.name);
  // Everyone, not the first thousand: past it, an appointment of a known person linked to nobody on the board, and
  // an owner's read asked the door for them again.
  return { ...read, feed, parsed: feed.parsed, serviceNames, ...(await people(feed.parsed)) };
}

/**
 * The record's taken time over the days the receptionist may offer (00345), for a feed that reads. The span's own rows
 * where the span covers those days, as the window around today does, so the board's first read asks nothing more;
 * else one read of them (record-busy.ts), so the next open time is the receptionist's own on a board turned to
 * another month.
 */
async function takenBesideTheFeed(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  read: Pick<CalendarSources, "timezone" | "span" | "rules" | "rows">,
  now: Date,
): Promise<BusyBlock[]> {
  const daysAhead = read.rules?.max_days_ahead ?? BOOKING_DEFAULTS.max_days_ahead;
  const offer = offeringHorizon(now, daysAhead);
  const from = zoneMidnight(read.timezone, read.span.from);
  const to = zoneMidnight(read.timezone, shiftKey(read.span.from, read.span.days));
  return from <= offer.from && offer.to <= to
    ? // Taken time is a visit that still stands, as the record's own read of it says (record-busy.ts): not one already
      // kept or missed, which the board draws all the same.
      busyOfAppointments(read.rows.filter((r) => r.status === "proposed" || r.status === "booked"))
    : recordBusy(ctx, tenantId, now, daysAhead);
}

/**
 * The board's week from what was read, a pure assembly: the feed's items by day, each matched to `people`, the windows
 * the receptionist would offer from `now`, and the first of them. `people` is the read's own, or those with the people
 * an owner's read just put in People. A week the read already answered whole is that week. Reads nothing, writes
 * nothing, and changes nothing it is handed.
 */
export function weekFrom(calendarSources: CalendarSources, people: PersonLike[], now: Date): CalendarWeekDto {
  const { timezone, span, source, ownAddresses, profile, rules, base, feed, parsed, serviceNames, rows, marks, taken } =
    calendarSources;
  // The feed's events, less those a row already draws (the same client, the same quarter hour): a visit a tool both
  // emailed and wrote into the calendar is drawn once, from the notice, which states what the event's title hints at.
  const events = parsed ? withoutVisitsRowsDraw(parsed.items, rows, ownAddresses) : [];
  const { days: fromFeed, dropped } = itemsToDays(
    events,
    span.from,
    span.days,
    timezone,
    people,
    ownAddresses,
    serviceNames,
    { services: profile?.services ?? [], rules, marks },
  );
  const days = withOrigins(
    withPersonFacts(daysWithAppointments(fromFeed, rows, timezone, people), calendarSources, timezone, now),
    calendarSources.origins,
  );
  // Open times only where a calendar reads: the rows say what was booked online, not what a staff member typed into
  // the tool, so rows alone offer nothing (the readers lane adds the owner's word on that). Beside a feed, a row is
  // taken time too: a tool that writes no calendar still took the slot. `taken` is the record over the days on offer,
  // the receptionist's own subtraction (edge availability.ts), so a window drawn here is one it would offer.
  const busy = parsed ? [...parsed.busy, ...taken] : [];
  const openings =
    profile && parsed
      ? freeWindows({ hours: profile.hours, closures: profile.closures, tz: timezone, busy, rules, now })
      : [];
  const windowsOf = new Map(openings.map((o) => [o.key, o.windows]));
  // The receptionist's next open time from now, whatever span the page asked for: the first of every time it would
  // offer. The page worked it out from the span it had loaded, so a board on December had none to name (C1).
  const first = openings.find((o) => o.windows.length)?.windows[0] ?? null;
  // A reason beside "ok" means the latest try failed and this is the last good read, said so on the chip. A feed that
  // could not be read keeps the base's state with the reason; no feed at all keeps the base's.
  const feedDto: CalendarFeedDto =
    parsed && feed
      ? {
          ...base.feed,
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
        }
      : feed
        ? unreadFeed(base.feed, feed)
        : base.feed;
  return {
    ...base,
    next_opening: first ? { start: new Date(first.start).toISOString(), end: new Date(first.end).toISOString() } : null,
    feed: feedDto,
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
 * Each visit with where its person came from (CalendarSources.origins), by its record row's id: a booking's row and a
 * feed event's kept row alike. A visit the record holds no row of, or whose person was not found as a lead, carries
 * none. Pure, as weekFrom is.
 */
function withOrigins<D extends { items: CalendarItemDto[] }>(
  days: D[],
  origins: ReadonlyMap<string, VisitOriginDto> | undefined,
): D[] {
  if (!origins?.size) return days;
  return days.map((d) => ({
    ...d,
    items: d.items.map((it) => {
      const origin = it.visit ? origins.get(it.visit.id) : undefined;
      return origin ? { ...it, origin } : it;
    }),
  }));
}

/**
 * Each visit's person with what the board says of them beyond who they are (calendar-person-facts.ts): their standing,
 * business, deal, step, last contact and last visit, from the People row the read matched them by (`firsts`: the ones in
 * for their first). One fact set per person, worked out once however many visits name them; nobody the read held no row
 * of (someone added between its two halves) carries none, and the sheet says only who they are. A pure assembly, as
 * weekFrom is.
 */
function withPersonFacts<D extends { items: CalendarItemDto[] }>(
  days: D[],
  { book, firsts }: Pick<CalendarSources, "book" | "firsts">,
  tz: string,
  now: Date,
): D[] {
  if (!book.size) return days;
  const facts = new Map<string, ReturnType<typeof calendarPersonFactsOf>>();
  const factsOf = (id: string) => {
    if (!facts.has(id)) {
      const row = book.get(id);
      if (row) facts.set(id, calendarPersonFactsOf(row, tz, now.getTime(), firsts.has(id)));
    }
    return facts.get(id);
  };
  return days.map((d) => ({
    ...d,
    items: d.items.map((it) => {
      const f = it.person ? factsOf(it.person.id) : undefined;
      return f && it.person ? { ...it, person: { ...it.person, facts: f } } : it;
    }),
  }));
}

/**
 * Takes only the client it reads with, not a whole RouteContext: Setup's
 * assembly calls this for a workspace that is not the caller's own -- the back
 * office reading somebody else's -- and there is no request behind that.
 *
 * The read (calendarSources), then the board assembled (weekFrom): one clock for the span, the people and the windows.
 * The calendar route takes the same two steps around its reader. Neither writes: the people an appointment names are put
 * in People by the hourly sweep and the booking email's reader, and by a press on the board (decision 0047, lane 6).
 */
export async function getCalendarWeek(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: TenantId,
  by: { from: string | null; days: number },
  now = new Date(),
  opts: {
    fresh?: boolean;
    feedOnly?: boolean;
    /** The zone, the raw settings and the mailbox, from a caller that holds or reads them itself (calendarSources). */
    timezone?: string;
    config?: unknown;
    mailbox?: () => Promise<MailboxRow | null>;
  } = {},
): Promise<CalendarWeekDto> {
  const s = await getCalendarSources(ctx, tenantId, by, now, {
    fresh: !!opts.fresh,
    feedOnly: !!opts.feedOnly,
    timezone: opts.timezone,
    config: opts.config,
    mailbox: opts.mailbox,
  });
  return weekFrom(s, s.people, now);
}
