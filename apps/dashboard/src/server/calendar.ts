import "server-only";
import {
  AppError,
  afterPersonRefused,
  eventText,
  extractContacts,
  FEED_MAX_BYTES,
  feedProblemWords,
  feedSourceLabel,
  feedUrlOk,
  bookedAfterAsk,
  freeWindows,
  guessName,
  indexFeed,
  isDayKey,
  isConsultationTitle,
  matchPerson,
  mondayOf,
  parseIcs,
  parseTenantConfigResult,
  peopleFromItems,
  previewHorizon,
  seasonHorizon,
  shiftKey,
  toVisitDto,
  zoneMidnight,
  type BookingRules,
  type BusinessProfile,
  type CalendarDayDto,
  type CalendarItemDto,
  type CalendarWeekDto,
  type FeedFailure,
  type FeedItem,
  type PersonLike,
  type PersonRowDto,
  type PersonVisitsDto,
  type TenantConfig,
  type ConsultRules,
  type VisitDto,
  allVisitsIn,
  type BookingReportDto,
  type ParsedFeed,
  visitsIn,
  needsConsultation,
  ownAddressesOf,
  type OwnAddresses,
} from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { tenantFacts } from "@/server/tenant";
import { everyone } from "@/server/people";
import { loadFeed } from "@/server/ask/openings";

/** The address rule is contracts' (feed-url.ts); re-exported so the settings routes' test reaches it at the door that uses it. */
export { feedUrlOk };

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
 * The feed parsed once per fetch. The board, a profile, the People list and
 * the report all read it; `loadFeed` caches the text for a few minutes and
 * this caches its parse for as long as the text is the same one.
 */
const parsedFeeds = new Map<string, { text: string; tz: string; parsed: ParsedFeed }>();

interface ParsedRead {
  /** Null when there has never been a good read. */
  parsed: ParsedFeed | null;
  at: number | null;
  /** Why the latest try failed; with a parse it means the parse is the last good read. */
  reason: FeedFailure | null;
  status: number | null;
  /** When the calendar was last tried, good or not; null when it never was. */
  checkedAt: number | null;
}

async function parsedFeedFor(tenantId: string, url: string, tz: string, now: Date, fresh = false): Promise<ParsedRead> {
  const feed = await loadFeed(tenantId, url, { fresh });
  if (!feed.text)
    return { parsed: null, at: null, reason: feed.reason, status: feed.status, checkedAt: feed.checkedAt };
  const hit = parsedFeeds.get(tenantId);
  if (hit && hit.text === feed.text && hit.tz === tz)
    return { parsed: hit.parsed, at: feed.at, reason: feed.reason, status: feed.status, checkedAt: feed.checkedAt };
  const parsed = parseIcs(feed.text, tz, { horizon: seasonHorizon(now) });
  parsedFeeds.set(tenantId, { text: feed.text, tz, parsed });
  return { parsed, at: feed.at, reason: feed.reason, status: feed.status, checkedAt: feed.checkedAt };
}

/**
 * Settings that will not parse are a READ THAT FAILED, not a workspace without a calendar.
 *
 * parseTenantConfig is documented as being "for callers that genuinely cannot act on the difference". Every
 * caller in this file CAN act on it, and the difference is the whole point: TenantConfigSchema is strict, so
 * ONE unrecognised key refuses the whole row and takes the calendar address down with it. Reported as "none",
 * that is indistinguishable from a workspace that never connected a calendar -- so the surfaces went quiet
 * instead of saying anything, and a bad config row survived two rounds of being looked straight at.
 *
 * Absent and broken are different things. Only absent is silent.
 *
 * `lostCalendar` is narrower than "the config did not parse", on purpose. A row can be refused over something
 * that has nothing to do with the calendar — a `brain` missing one of its required fields refuses the whole
 * row — and a workspace that never connected a calendar is not missing one. So the raw JSON is asked the one
 * question the schema can no longer answer: is an address in there? Yes, and we could not reach it: that is
 * news, said out loud. No: nothing was lost, stay quiet, and the log still has the issues either way.
 */
function readSettings(tenantId: string, raw: unknown): { cfg: TenantConfig | null; lostCalendar: boolean } {
  const r = parseTenantConfigResult(raw);
  if (r.ok) return { cfg: r.config, lostCalendar: false };
  const named = (raw as { calendar?: { ical_url?: unknown } } | null)?.calendar?.ical_url;
  const lostCalendar = typeof named === "string" && named.trim() !== "";
  console.error(
    "tenant_config_unreadable",
    JSON.stringify({ tenant: tenantId, lostCalendar, issues: r.issues.slice(0, 8) }),
  );
  return { cfg: null, lostCalendar };
}

/**
 * The workspace's calendar, as the people surfaces need it: its address (kept here), zone and name — and the
 * booking link, which a row may offer. `lostCalendar` is true when the settings would not parse AND they name
 * a calendar, which is why a null url is not always "no calendar" (see readSettings).
 */
async function calendarOf(
  ctx: RouteContext,
  tenantId: string,
): Promise<{
  url: string | null;
  lostCalendar: boolean;
  timezone: string;
  source: string;
  bookingLink: string | null;
  own: OwnAddresses;
  /** The business's profile: its services, and the rules that say which need a consultation first. Null without one. */
  profile: BusinessProfile | null;
}> {
  const [{ timezone }, { data: row, error }] = await Promise.all([
    tenantFacts(ctx.supabase, tenantId),
    ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const { cfg, lostCalendar } = readSettings(tenantId, row?.config ?? null);
  const url = cfg?.calendar?.ical_url ?? null;
  const bookingLink = cfg?.brain?.booking_link?.trim() || null;
  // Server-side only: the address feeds the reads in this module and is never part of a response.
  // The business's own addresses (contracts ownAddressesOf): where it is alerted,
  // and whose calendar this is. Never a customer's, so never anybody's visit.
  return {
    url,
    lostCalendar,
    timezone,
    source: feedSourceLabel(url),
    bookingLink,
    own: ownAddressesOf(cfg),
    profile: cfg?.brain?.profile ?? null,
  };
}

export function spanFor(from: string | null, days: number, tz: string, now: Date): { from: string; days: number } {
  const todayKey = ((): string => {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    return f.format(now);
  })();
  const start = isDayKey(from) ? from : mondayOf(todayKey);
  return { from: start, days: Math.min(MAX_DAYS, Math.max(1, Math.round(days) || 7)) };
}

/** People as the matcher wants them: a human-given name (never a phone made words), the E.164, the address (00125), and the thread a link is texted into when they have one. */
export function personLike(
  p: Pick<PersonRowDto, "id" | "display_name" | "wa_profile_name" | "phone_e164"> &
    Partial<Pick<PersonRowDto, "email" | "has_chat" | "latest_conversation_id" | "latest_wa_inbound_at">>,
): PersonLike {
  return {
    id: p.id,
    name: p.display_name || p.wa_profile_name || "",
    phone: p.phone_e164,
    // Optional on the Pick the way personName takes it: a row read before
    // 00125 carries no address, and no address is no match, never a crash.
    email: p.email ?? null,
    thread: p.has_chat && p.latest_conversation_id ? p.latest_conversation_id : null,
    waInboundAt: p.latest_wa_inbound_at ?? null,
  };
}

export function itemsToDays(
  items: FeedItem[],
  from: string,
  days: number,
  tz: string,
  people: PersonLike[],
  own: OwnAddresses,
  services: string[] = [],
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
      };
    });
    out.push({ key, items: rows });
  }
  return { days: out, dropped };
}

/**
 * The people the feed names by phone who are not in People yet, added
 * through the `create_person` door — owner or operator only, which is what
 * `canAct` says; a viewer's read changes nothing. Capped per read: the
 * hourly sweep on the edge takes the rest. Never fatal to the board.
 */
async function addPeopleSeen(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  items: FeedItem[],
  services: string[],
  people: PersonLike[],
  now: Date,
): Promise<PersonLike[]> {
  const have = new Set(people.map((p) => p.phone).filter(Boolean));
  const rows = peopleFromItems(items, services, now.getTime())
    .filter((r) => !have.has(r.phone))
    .slice(0, 40);
  const added: PersonLike[] = [];
  // Counted, then said once. Logging per row turned one bad number into forty
  // identical lines and still never said how many people it had cost.
  let refused = 0;
  let firstRefusal: string | null = null;
  for (const r of rows) {
    // The door records the `contact.added` event itself (members cannot
    // insert events), with the appointment that named them.
    const { data, error } = await ctx.supabase.rpc("create_person", {
      p_tenant_id: tenantId,
      p_phone_e164: r.phone,
      p_display_name: r.name ?? "",
      p_source: "calendar",
      p_title: r.title,
    });
    if (error) {
      // One bad number is one person, not everyone behind them. See
      // afterPersonRefused: 22023 is the door refusing THIS row, anything
      // else refuses every row and is worth stopping for.
      if (afterPersonRefused(error.code) === "skip") {
        refused += 1;
        firstRefusal ??= error.message;
        continue;
      }
      console.error(
        "calendar_person_add_failed",
        JSON.stringify({ tenant: tenantId, code: error.code, error: error.message }),
      );
      break;
    }
    const out = data as { contact_id: string; existed: boolean };
    // No address: the door takes a phone, and nobody is made from an
    // attendee's address. They match by the number they were created from.
    added.push({ id: out.contact_id, name: r.name ?? "", phone: r.phone, email: null });
  }
  if (refused) {
    console.error(
      "calendar_people_refused",
      JSON.stringify({ tenant: tenantId, refused, of: rows.length, added: added.length, first: firstRefusal }),
    );
  }
  return added;
}

/**
 * Takes only the client it reads with, not a whole RouteContext: Setup's
 * assembly calls this for a workspace that is not the caller's own -- the back
 * office reading somebody else's -- and there is no request behind that.
 */
export async function calendarWeek(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  by: { from: string | null; days: number },
  now = new Date(),
  opts: { canAct?: boolean; fresh?: boolean } = {},
): Promise<CalendarWeekDto> {
  const { timezone } = await tenantFacts(ctx.supabase, tenantId);
  const span = spanFor(by.from, by.days, timezone, now);
  const { data: row, error } = await ctx.supabase
    .from("tenant_config")
    .select("config")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const { cfg, lostCalendar } = readSettings(tenantId, row?.config ?? null);
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
  if (!url) return base;

  // One parse per fetch, shared with the profile, the People list and the
  // report. Its horizon — ninety days either side — covers any span the page
  // asks for and the openings' reach from now, so the windows are the
  // receptionist's own, never computed from a feed cut short. A fresh read is the board's Refresh (C2).
  let feed: ParsedRead;
  try {
    feed = await parsedFeedFor(tenantId, url, timezone, now, !!opts.fresh);
  } catch (e) {
    console.error(
      "calendar_parse_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    feed = { parsed: null, at: null, reason: "not_ical", status: null, checkedAt: null };
  }
  // Nothing readable, ever: the board says why, in the words the preview uses.
  if (!feed.parsed)
    return {
      ...base,
      feed: {
        ...base.feed,
        checked_at: feed.checkedAt === null ? null : new Date(feed.checkedAt).toISOString(),
        reason: feed.reason,
        status: feed.status,
        problem: feedProblemWords(feed.reason, feed.status),
      },
    };
  const parsed = feed.parsed;
  const serviceNames = (profile?.services ?? []).map((s) => s.name);
  // Everyone, not the first thousand: past it, an appointment of a known person linked to nobody on the board, and
  // the add below asked the door for them again.
  const people = (await everyone(ctx, tenantId).catch(() => [])).map(personLike);
  // The people this feed names are put in People here, so the board an
  // owner is looking at already links to them; the hourly sweep does the
  // same for everyone else, and for a feed nobody opens.
  if (opts.canAct)
    people.push(
      ...(await addPeopleSeen(ctx, tenantId, parsed.items, serviceNames, people, now).catch((e: unknown) => {
        console.error(
          "calendar_people_seen_failed",
          JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
        );
        return [];
      })),
    );
  const { days, dropped } = itemsToDays(
    parsed.items,
    span.from,
    span.days,
    timezone,
    people,
    ownAddressesOf(cfg),
    serviceNames,
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
      source: feedSourceLabel(url),
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

/* ---- A feed checked before it is saved ---- */

export interface FeedPreview {
  ok: true;
  events: number;
  recurring_expanded: number;
  skipped_recurring: number;
  /** The next few taken blocks, in the business's zone words. */
  next: Array<{ start: string; end: string; title: string }>;
}

/** The address rule and the words are contracts' (feed-url.ts): the same ones the save, the board and Setup use. */
export async function previewFeed(url: string, tz: string, now = new Date()): Promise<FeedPreview> {
  const safe = feedUrlOk(url);
  if (!safe)
    throw new AppError("validation", feedProblemWords("address") ?? "Not an address the receptionist may read.");
  let text: string;
  try {
    const res = await fetch(safe, {
      signal: AbortSignal.timeout(8_000),
      headers: { accept: "text/calendar, */*" },
      redirect: "follow",
    });
    if (!res.ok)
      throw new AppError(
        "upstream_meta",
        feedProblemWords("http", res.status) ?? "The calendar answered with an error.",
        502,
      );
    text = await res.text();
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("upstream_meta", feedProblemWords("unreachable") ?? "The calendar could not be reached.", 502);
  }
  if (text.length > FEED_MAX_BYTES)
    throw new AppError("validation", feedProblemWords("too_large") ?? "That feed is too large to read.");
  if (!/BEGIN:VCALENDAR/i.test(text))
    throw new AppError("validation", feedProblemWords("not_ical") ?? "That address is not an iCal feed.");
  const parsed = parseIcs(text, tz, { horizon: previewHorizon(now) });
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const next = parsed.items
    .filter((it) => it.end >= now.getTime())
    .sort((a, b) => a.start - b.start)
    .slice(0, 3)
    .map((it) => ({
      start: f.format(new Date(it.start)),
      end: new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(
        new Date(it.end),
      ),
      title: it.title || "Busy",
    }));
  return {
    ok: true,
    events: parsed.events,
    recurring_expanded: parsed.recurringExpanded,
    skipped_recurring: parsed.skippedRecurring,
    next,
  };
}

/* ---- One person's appointments, for their profile ---- */

/**
 * The next and last appointment for one person, read from the same feed
 * with the same match the board uses. Null when the workspace has no
 * calendar; "unavailable" when it has one that could not be read. Ninety
 * days back and sixty ahead: a last visit worth naming, and a next one
 * booked past the receptionist's own offering window.
 */
export async function personVisits(
  ctx: RouteContext,
  tenantId: string,
  person: PersonLike,
  now = new Date(),
): Promise<PersonVisitsDto | null> {
  const { url, lostCalendar, timezone, source, own } = await calendarOf(ctx, tenantId);
  // No calendar: nothing to say about this person's visits. A calendar the settings hid: say that, not nothing.
  if (!url) return lostCalendar ? { timezone, source, state: "unavailable", next: null, last: null } : null;
  let feed: ParsedRead;
  try {
    feed = await parsedFeedFor(tenantId, url, timezone, now);
  } catch (e) {
    console.error(
      "calendar_parse_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    feed = { parsed: null, at: null, reason: "not_ical", status: null, checkedAt: null };
  }
  if (!feed.parsed) return { timezone, source, state: "unavailable", next: null, last: null };
  const index = indexFeed(feed.parsed.items, own);
  const v = visitsIn(index, person, now.getTime());
  // The timeline wants them all; a season either side is what the parse holds.
  const all = allVisitsIn(index, person)
    .map((x) => toVisitDto(x) as VisitDto)
    .slice(-60);
  return { timezone, source, state: "ok", next: toVisitDto(v.next), last: toVisitDto(v.last), all };
}

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
 * The next and last appointment of everyone on the list, from one parsed
 * feed indexed once — the number first, the whole name second — so a list
 * of hundreds costs one read of the calendar, not hundreds.
 */
export async function peopleVisits(
  ctx: RouteContext,
  tenantId: string,
  rows: PersonRowDto[],
  now = new Date(),
): Promise<PeopleVisits> {
  const { url, lostCalendar, timezone, source, bookingLink, own, profile } = await calendarOf(ctx, tenantId);
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
    console.error(
      "calendar_parse_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    feed = { parsed: null, at: null, reason: "not_ical", status: null, checkedAt: null };
  }
  if (!feed.parsed)
    return { calendar: { state: "unavailable", source, timezone }, visits, bookingLink, services, rules };
  const index = indexFeed(feed.parsed.items, own);
  const nowMs = now.getTime();
  for (const r of rows) {
    const v = visitsIn(index, personLike(r), nowMs);
    visits.set(r.id, { timezone, source, state: "ok", next: toVisitDto(v.next), last: toVisitDto(v.last) });
  }
  return { calendar: { state: "ok", source, timezone }, visits, bookingLink, services, rules };
}

/** The rows with their appointments attached, the way the People list and the assistant read them. */
export async function withVisits(
  ctx: RouteContext,
  tenantId: string,
  rows: PersonRowDto[],
  now = new Date(),
): Promise<{
  people: PersonRowDto[];
  calendar: PeopleVisits["calendar"];
  booking_link: string | null;
  /** The profile lists a consult-first service (0004): the "Consultation booked" list exists only then. */
  consult_first: boolean;
}> {
  const pv = await peopleVisits(ctx, tenantId, rows, now).catch((e: unknown) => {
    console.error(
      "people_visits_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return null;
  });
  if (!pv)
    return {
      people: rows.map((r) => ({ ...r, visits: null })),
      calendar: { state: "none", source: "your calendar", timezone: "UTC" },
      booking_link: null,
      consult_first: false,
    };
  // Each visit says whether it is a consultation (0004): its title says so, or names a consult-first service.
  const mark = (v: VisitDto | null): VisitDto | null =>
    v ? { ...v, consultation: isConsultationTitle(v.title, pv.services, pv.rules) } : null;
  const marked = (x: PersonVisitsDto | undefined): PersonVisitsDto | null =>
    x ? { ...x, next: mark(x.next), last: mark(x.last) } : null;
  return {
    people: rows.map((r) => ({
      ...r,
      visits:
        pv.calendar.state === "ok"
          ? marked(pv.visits.get(r.id))
          : pv.calendar.state === "unavailable"
            ? {
                timezone: pv.calendar.timezone,
                source: pv.calendar.source,
                state: "unavailable",
                next: null,
                last: null,
              }
            : null,
    })),
    calendar: pv.calendar,
    booking_link: pv.bookingLink,
    consult_first: (pv.rules?.consult_first ?? []).length > 0,
  };
}

/**
 * Asked, then booked: of the people who wrote or called in the period, how
 * many have an appointment on the calendar — upcoming, or held since they
 * reached out. The one conversion line Reports carries.
 */
export async function bookingReport(
  ctx: RouteContext,
  tenantId: string,
  rows: PersonRowDto[],
  days: number,
  now = new Date(),
): Promise<BookingReportDto> {
  const pv = await peopleVisits(ctx, tenantId, rows, now);
  const nowMs = now.getTime();
  const since = nowMs - days * 86_400_000;
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
