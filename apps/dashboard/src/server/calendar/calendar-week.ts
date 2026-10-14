/**
 * The board's week: its span by the business's clock, the feed's items by day, the one read for a span
 * (calendarSources), the week assembled from it (weekFrom), and the two in turn (calendarWeek). None of them writes: a
 * read of the board adds nobody to People (decision 0047, lane 6); the feed's parse is parsed-feed.ts's.
 */
import "server-only";
import {
  appointmentKeyOf,
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
  windowFor,
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
  withoutVisitsRowsDraw,
  daysWithAppointments,
  busyOfAppointments,
  offeringHorizon,
  BOOKING_DEFAULTS,
  isNoticeHold,
  suggestLocalPart,
  type AppointmentLike,
  type BusyBlock,
  type CalendarFeedDto,
  type CalendarNoticesDto,
  type PersonRowDto,
  type TenantConfig,
  calendarPersonFactsOf,
  markOn,
  type FeedMark,
  feedMarksOf,
} from "@chanlytics/contracts";
import {
  appointmentNoticesOf,
  heldNoticesOf,
  mailboxOfTenant,
  type MailboxRow,
  visitsOver,
  type AppointmentRow,
} from "@chanlytics/db";
import { hostedAddress } from "@chanlytics/channels";
import type { RouteContext } from "@/server/with-route";
import { emailDomain } from "../connections/email";
import { tenantFacts } from "@/server/tenant";
import { everyone } from "@/server/people/people";
import { readSettings } from "./calendar-settings";
import { storedConfigOf } from "@/server/workspace/config-row";
import { parsedFeedFor, type ParsedRead } from "./parsed-feed";
import { recordBusy } from "./record-busy";
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

/**
 * The span a read covers. A day named is where it starts. With none, `around` says the board's own window (contracts
 * windowFor: the weeks around the business's today, which the page used to work out from the zone before it could ask,
 * so its first read waited for who is looking and could not be started from the document's head); else today's week.
 */
function spanFor(
  from: string | null,
  days: number,
  tz: string,
  now: Date,
  around: "today" | null = null,
): { from: string; days: number } {
  const todayKey = ((): string => {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    return f.format(now);
  })();
  if (!isDayKey(from) && around === "today") return windowFor(todayKey);
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
  consult: {
    services: readonly { name: string }[];
    rules: ConsultRules | null;
    /** The record's row for each event the sync keeps, by its key and start (markOn): what a member's word is said on. */
    marks?: ReadonlyMap<string, FeedMark>;
  },
): { days: Array<Pick<CalendarDayDto, "key" | "items">>; dropped: number } {
  const out: Array<Pick<CalendarDayDto, "key" | "items">> = [];
  let dropped = 0;
  for (let i = 0; i < days; i++) {
    const key = shiftKey(from, i);
    const dayStart = zoneMidnight(tz, key);
    const dayEnd = zoneMidnight(tz, shiftKey(key, 1));
    const inDay = items.filter((it) => it.end > dayStart && it.start < dayEnd);
    if (inDay.length > MAX_ITEMS_PER_DAY) dropped += inDay.length - MAX_ITEMS_PER_DAY;
    // A block's id is its appointment's key (appointmentKeyOf: the UID, with the occurrence for one of a series), so it
    // is the same block on every read: an index said only for a true twin. It carried the event's place in the day's list,
    // so an event added before it on the five-minute read moved every id after it, and closed the sheet open on it.
    const seen = new Map<string, number>();
    const rows: CalendarItemDto[] = inDay.slice(0, MAX_ITEMS_PER_DAY).map((it) => {
      const c = extractContacts(it, own);
      const key = appointmentKeyOf(it);
      const twin = seen.get(key) ?? 0;
      seen.set(key, twin + 1);
      return {
        id: twin ? `${key}#${twin}` : key,
        start: new Date(it.start).toISOString(),
        end: new Date(it.end).toISOString(),
        title: it.title,
        all_day: it.allDay,
        person: matchPerson(it, people, own),
        description: eventText(it.description),
        location: it.location,
        contacts: { phones: c.phones, emails: c.emails },
        guess: guessName(it, services),
        ...(it.occurrence !== undefined ? { series: true } : {}),
        consultation: isConsultationTitle(it.title, consult.services, consult.rules),
        consult_service: consultServiceOf(it.title, consult.services, consult.rules),
        visit: markOn(consult.marks, it),
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
  /**
   * The People rows the matcher's `people` were made of, by id: what the board says of each person a visit names
   * (calendar-person-facts.ts), so the page reads no People of its own. Empty where nobody was read.
   */
  book: ReadonlyMap<string, PersonRowDto>;
  /**
   * The appointments the record holds over the span (00345): the bookings that arrived by email, drawn beside the
   * feed's events (docs/plans/2026-10-07-bookings-arrive-by-email.md). Empty for a workspace none have reached.
   */
  rows: AppointmentLike[];
  /** The record's row for each feed event the hourly sync keeps, by its key, with how it stands (feedMarksOf). */
  marks: ReadonlyMap<string, FeedMark>;
  /**
   * The record's taken time over the days the receptionist may offer, read beside a feed that reads (record-busy.ts):
   * what the open times subtract with the feed's own, whichever span the page shows. Empty with no readable feed,
   * where no time is offered.
   */
  taken: BusyBlock[];
  /** The feed's read, null with no address; its parse, null when it could not be read. */
  feed: ParsedRead | null;
  parsed: ParsedFeed | null;
};

/** The feed's state for a calendar that was fetched and could not be read: the reason the board says. */
function unreadFeed(base: CalendarFeedDto, feed: ParsedRead): CalendarFeedDto {
  return {
    ...base,
    checked_at: feed.checkedAt === null ? null : new Date(feed.checkedAt).toISOString(),
    reason: feed.reason,
    status: feed.status,
    problem: feedProblemWords(feed.reason, feed.status),
  };
}

/**
 * The record's rows over the span and the notices' health line, read beside the feed: the bookings that arrived by
 * email (00345, docs/plans/2026-10-07-bookings-arrive-by-email.md). Asked for in one order (ask/readers.test.mjs pins
 * it) and waited for together: none needs another's answer, and one after the other they were four round trips the
 * board stood behind (9 Oct 2026). A failed read is an empty board side and a logged line, never a board that fails to
 * draw the feed.
 */
async function recordOverSpan(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  tz: string,
  from: string,
  to: string,
  by: { tool: string | null; name: string | null },
): Promise<{ rows: AppointmentLike[]; marks: Map<string, FeedMark>; notices: Omit<CalendarNoticesDto, "count"> }> {
  const spanFrom = new Date(zoneMidnight(tz, from)).toISOString();
  const spanTo = new Date(zoneMidnight(tz, shiftKey(to, 1))).toISOString();
  const failed = (e: unknown) =>
    log.error("calendar_notices_read_failed", {
      tenant_id: tenantId,
      error: e instanceof Error ? e.message : String(e),
    });
  const [record, notices] = await Promise.all([
    visitsOver(ctx.supabase, tenantId, spanFrom, spanTo).catch((e): { noted: AppointmentRow[]; feed: [] } => {
      failed(e);
      return { noted: [], feed: [] };
    }),
    noticesHealth(ctx, tenantId, by, true),
  ]);
  // A booking's rows however they stand: drawn (a cancelled one struck), and each one's copy in the feed left out
  // (withoutVisitsRowsDraw), cancelled or not. The feed's own rows by key, for what a member says on them.
  return { rows: record.noted, marks: feedMarksOf(record.feed), notices };
}

/**
 * The notices' health line alone: the tool, the address its emails go to, the latest that became a visit, how many are
 * held, and Gmail's pending confirmation. With `listed`, the held ones as the card lists them; without, their count
 * only, which is all Setup's and Connections' row says (the whole of what a feed-only read asks of the record).
 * `mailboxRead`: how to ask for the workspace's mailbox, from a caller that reads it for more than this (Setup).
 */
async function noticesHealth(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  by: { tool: string | null; name: string | null },
  listed: boolean,
  mailboxRead: () => Promise<MailboxRow | null> = () => mailboxOfTenant(ctx.supabase, tenantId),
): Promise<Omit<CalendarNoticesDto, "count">> {
  const { tool } = by;
  // The latest and the held count beside the workspace's address, as the tool is to send to, with Gmail's pending
  // confirmation of a forward here (00345): two reads that wait for nothing of each other's.
  const [latest, mailbox] = await Promise.all([
    appointmentNoticesOf(ctx.supabase, tenantId).catch(() => ({ tool: null, last_at: null, held: 0 })),
    mailboxRead().catch(() => null),
  ]);
  // The held ones themselves only where the count says there are any.
  const held = listed && latest.held ? await heldNoticesOf(ctx.supabase, tenantId).catch(() => []) : [];
  const domain = emailDomain();
  const local = suggestLocalPart(by.name);
  const notices: Omit<CalendarNoticesDto, "count"> = {
    tool: tool ?? latest.tool,
    address: mailbox && domain ? hostedAddress(mailbox.local_part, domain) : null,
    // Where it has none: the one its name would give, which the fold offers in one press (mailbox.ts suggestLocalPart).
    suggested: !mailbox && domain && local ? hostedAddress(local, domain) : null,
    last_at: latest.last_at,
    held: latest.held,
    held_list: held.flatMap((n) =>
      isNoticeHold(n.hold_reason)
        ? [
            {
              id: n.id,
              notice_id: n.notice_id,
              tool: n.tool,
              from: n.from_address,
              subject: n.subject,
              received_at: n.received_at,
              reason: n.hold_reason,
            },
          ]
        : [],
    ),
    forwarding:
      mailbox?.forward_confirm_code && mailbox.forward_confirm_account && mailbox.forward_confirm_at
        ? {
            account: mailbox.forward_confirm_account,
            code: mailbox.forward_confirm_code,
            link: mailbox.forward_confirm_link,
            at: mailbox.forward_confirm_at,
          }
        : null,
  };
  return notices;
}

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
 * The calendar's one read for a span, and nothing written (D7): calendarWeek's reads, in its order, up to the point an
 * owner's read would put the feed's people in People. The zone and the settings are read here unless a caller that
 * read them this turn hands them in (readers/calendar.ts), so a turn reads the tenant once. What the board shows
 * follows from this alone (weekFrom); a read that adds people does so between the two (calendarWeek, the calendar
 * route). Takes only the client it reads with, as calendarWeek does. `mailbox`: how a caller that reads the
 * workspace's mailbox for more than the notices' line asks for it (Setup), so it is asked once.
 */
export async function calendarSources(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
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
  const timezone = opts.timezone ?? (await tenantFacts(ctx.supabase, tenantId)).timezone;
  const span = spanFor(by.from, by.days, timezone, now, by.around ?? null);
  // The settings whole, the feed's address with them, for any member: the server reads the feed (config-row.ts).
  const raw = opts.config === undefined ? await storedConfigOf(ctx.supabase, tenantId) : opts.config;
  const { cfg, lostCalendar } = readSettings(tenantId, raw);
  const url = cfg?.calendar?.ical_url ?? null;
  const profile = cfg?.brain?.profile ?? null;
  const rules: BookingRules | null = profile?.booking_rules ?? null;
  const to = shiftKey(span.from, span.days - 1);

  const base = weekBeforeReading(timezone, span, to, cfg, url, lostCalendar);
  // A caller that asks only where the calendar stands (`feedOnly`: Setup's row) is read no visit of the record, and
  // the notices' health only where the owner named a tool: without one no email was ever read as a booking, so there
  // is nothing to ask, and a workspace that never set this up costs Setup no query.
  const named = { tool: cfg?.bookings?.tool ?? null, name: cfg?.brain?.business_name ?? null };
  const { rows, marks, notices } = !opts.feedOnly
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
  const sources = await withFeedAndPeople(ctx, tenantId, read, url, profile, now, {
    fresh: !!opts.fresh,
    feedOnly: !!opts.feedOnly,
  });
  // Beside a feed that reads, the record's taken time, which the open times subtract; never for a feed-only read.
  const taken = sources.parsed && !opts.feedOnly ? await takenBesideTheFeed(ctx, tenantId, read, now) : [];
  return { ...sources, taken };
}

/** A read that asks nothing of the record: no rows over the span, no notice's health line, no address. */
const NO_RECORD: {
  rows: AppointmentLike[];
  marks: Map<string, FeedMark>;
  notices: Omit<CalendarNoticesDto, "count">;
} = {
  rows: [],
  marks: new Map(),
  notices: { tool: null, address: null, last_at: null, held: 0, held_list: [], forwarding: null },
};

/**
 * What calendarSources reads once the settings are known: the feed, when there is an address, and everyone in People.
 * A read that asks only where the calendar stands (`feedOnly`) reads nobody: its row names no one, and every Setup
 * and Connections of a workspace with a calendar link read all of People to say whether the link reads (9 Oct 2026).
 */
async function withFeedAndPeople(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  read: Omit<CalendarSources, "feed" | "parsed" | "serviceNames" | "people" | "book" | "taken">,
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
    !feedOnly && (url || rows.length) ? everyone(ctx, tenantId).catch(() => []) : Promise.resolve([]);
  // The matcher's people and the rows they were made of, from the one read.
  const people = async (): Promise<Pick<CalendarSources, "people" | "book">> => {
    const all = await everyoneRead;
    return { people: all.map(personLike), book: new Map(all.map((r) => [r.id, r])) };
  };
  if (!url) return { ...read, feed: null, parsed: null, serviceNames: [], ...(await people()) };

  // One parse per fetch, shared with the profile, the People list and the
  // report. Its horizon — ninety days either side — covers any span the page
  // asks for and the openings' reach from now, so the windows are the
  // receptionist's own, never computed from a feed cut short. A fresh read is the board's Refresh (C2).
  let feed: ParsedRead;
  try {
    feed = await parsedFeedFor(tenantId, url, timezone, now, { fresh });
  } catch (e) {
    log.error("calendar_parse_failed", { tenant_id: tenantId, error: e instanceof Error ? e.message : String(e) });
    feed = { parsed: null, at: null, reason: "not_ical", status: null, checkedAt: null };
  }
  // Nothing readable, ever: the board says why, in the words the preview uses; the record's rows are drawn all the same.
  if (!feed.parsed) return { ...read, feed, parsed: null, serviceNames: [], ...(await people()) };
  const serviceNames = (profile?.services ?? []).map((s) => s.name);
  // Everyone, not the first thousand: past it, an appointment of a known person linked to nobody on the board, and
  // an owner's read asked the door for them again.
  return { ...read, feed, parsed: feed.parsed, serviceNames, ...(await people()) };
}

/**
 * The record's taken time over the days the receptionist may offer (00345), for a feed that reads. The span's own rows
 * where the span covers those days, as the window around today does, so the board's first read asks nothing more;
 * else one read of them (record-busy.ts), so the next open time is the receptionist's own on a board turned to
 * another month.
 */
async function takenBesideTheFeed(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
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
export function weekFrom(s: CalendarSources, people: PersonLike[], now: Date): CalendarWeekDto {
  const { timezone, span, source, ownAddresses, profile, rules, base, feed, parsed, serviceNames, rows, marks, taken } =
    s;
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
  const days = withPersonFacts(daysWithAppointments(fromFeed, rows, timezone, people), s.book, timezone, now);
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
 * Each visit's person with what the board says of them beyond who they are (calendar-person-facts.ts): their standing,
 * business, deal, step and last contact, from the People row the read matched them by. One fact set per person, worked out
 * once however many visits name them; nobody the read held no row of (someone added between its two halves) carries
 * none, and the sheet says only who they are. A pure assembly, as weekFrom is.
 */
function withPersonFacts<D extends { items: CalendarItemDto[] }>(
  days: D[],
  book: ReadonlyMap<string, PersonRowDto>,
  tz: string,
  now: Date,
): D[] {
  if (!book.size) return days;
  const facts = new Map<string, ReturnType<typeof calendarPersonFactsOf>>();
  const factsOf = (id: string) => {
    if (!facts.has(id)) {
      const row = book.get(id);
      if (row) facts.set(id, calendarPersonFactsOf(row, tz, now.getTime()));
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
export async function calendarWeek(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
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
  const s = await calendarSources(ctx, tenantId, by, now, {
    fresh: !!opts.fresh,
    feedOnly: !!opts.feedOnly,
    timezone: opts.timezone,
    config: opts.config,
    mailbox: opts.mailbox,
  });
  return weekFrom(s, s.people, now);
}
