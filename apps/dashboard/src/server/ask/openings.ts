import "server-only";
import {
  BOOKING_DEFAULTS,
  MIN_MS,
  bookingToolName,
  calendarFeedKeyOf,
  describeOpenings,
  feedBodyProblem,
  feedUrlOk,
  fetchPublic,
  filterOpenings,
  freeWindows,
  mailboxCalendarOf,
  offerFor,
  offerLead,
  offeringHorizon,
  offersBookingLink,
  parseIcs,
  parseTenantConfig,
  type AskOpeningsView,
  type BusyBlock,
  type FeedFailure,
  type FreeWindowsInput,
  type Opening,
  type TenantConfig,
} from "@chanlytics/contracts";
import { publicFetcher } from "@chanlytics/channels";
import { fillerFeedFor } from "../calendar/filler-calendar";
import { callEdge, edgeConfigured } from "../edge";
import { log } from "@/server/log";

/** How long the edge has to read a calendar through a mailbox's grant: a few pages of each calendar. */
const GRANT_FEED_MS = 20_000;

/**
 * A calendar read through a connected mailbox's grant (decision 0073, R20), as iCal: the edge holds the grant
 * (apps/edge/api/admin/calendar/feed.ts), so the dashboard asks it. Throws a refusal the cache keeps as a failed read.
 */
async function grantFeedText(tenantId: string): Promise<string> {
  if (!edgeConfigured()) throw new FeedRefused("unreachable");
  const a = await callEdge(
    "/api/admin/calendar/feed",
    { tenant_id: tenantId },
    { workspace: tenantId, user: null, timeoutMs: GRANT_FEED_MS },
  );
  const b = a.body as { ok?: boolean; text?: unknown } | null;
  if (a.status !== 200 || !b?.ok || typeof b.text !== "string") throw new FeedRefused("http", a.status);
  return b.text;
}

/**
 * Openings for the assistant and the palette's fast path, computed the way
 * the phone receptionist computes them (edge availability.ts): the calendar
 * feed's busy blocks, and the record's taken time beside them (00345), against
 * the business's hours, closures and booking rules, in the business's zone,
 * which the caller read under its own RLS; the feed URL is fetched server-side
 * and never sent to the browser.
 */

const FEED_TTL_MS = 5 * 60 * 1000;
/** A failed read is remembered for a minute: one broken feed must not cost eight seconds on every page that reads it. */
const FEED_FAIL_TTL_MS = 60 * 1000;
/**
 * The least time between two fetches an owner's Refresh can force (C2): pressed twice in a row, the calendar is asked
 * once. Past it, a fresh read skips the caches above -- the board's only way to see a change was to wait them out.
 */
const FEED_FRESH_FLOOR_MS = 15 * 1000;
/**
 * How old a good read may be and still be handed back at once to a reader that asked for it (`stale`), while the fetch
 * goes on behind it for whoever asks next: a person's page, whose next visit waited on the calendar's own server every
 * five minutes. Past this, that reader waits for the fetch like anyone else.
 */
const FEED_STALE_MAX_MS = 30 * 60 * 1000;

interface FeedEntry {
  /**
   * The address it was read from. The cache is kept by workspace, and a workspace has one calendar, but its address
   * changes: for five minutes after an owner pasted a new one the board went on drawing the old calendar, and where
   * the new one could not be read the old one's events stood as its "last good read" for as long as it failed.
   */
  url: string;
  /** The last good text and when it was read; null when there has never been one. */
  text: string | null;
  at: number | null;
  /** When the feed was last tried, good or not. */
  checkedAt: number;
  /** Why the last try failed, or null. */
  reason: FeedFailure | null;
  status: number | null;
}
const feeds = new Map<string, FeedEntry>();
/** A fetch going on behind a stale read, by workspace: one at a time. */
const refreshing = new Map<string, Promise<FeedRead>>();

/** What a read of the feed gave: the text (fresh, or the last good one when the latest try failed) and, when it failed, why. */
export interface FeedRead {
  text: string | null;
  at: number | null;
  reason: FeedFailure | null;
  status: number | null;
  /** When the calendar was last tried, good or not: what "tried 3m ago" says when a try failed (C2). */
  checkedAt: number;
}

class FeedRefused extends Error {
  constructor(
    readonly reason: FeedFailure,
    readonly status: number | null = null,
  ) {
    super(reason);
  }
}

const asRead = (e: FeedEntry): FeedRead => ({
  text: e.text,
  at: e.at,
  reason: e.reason,
  status: e.status,
  checkedAt: e.checkedAt,
});

/**
 * The feed's text and when it was read: fresh within the cache, else the
 * last good read — and, when the latest try failed, why, so the board and
 * Setup can say so instead of "could not be read". The address is held to
 * the same rule the preview applies (feedUrlOk): a private address saved
 * before the rule reached the write path is refused here, never fetched.
 *
 * `stale`: past the cache, a good read under half an hour old is handed back now and the fetch goes on behind it. Only
 * for a reader that says what was booked (a person's visits); availability never takes it -- an opening offered from
 * an old week is a double booking -- and neither does a Refresh.
 */
export async function loadFeed(
  tenantId: string,
  url: string,
  opts: { fresh?: boolean; stale?: boolean } = {},
): Promise<FeedRead> {
  // The filler's calendar is made here, never fetched: it is this deployment's own address, and a
  // serverless function asking its own domain for a file it can write from memory is a round trip that
  // can time out or be refused. When it failed the day card went silent, because a feed that cannot be
  // read is not the same as a surface that is missing, and only the second draws a failed-read notice.
  const made = fillerFeedFor(url);
  if (made !== null) {
    const now = Date.now();
    return { text: made, at: now, reason: null, status: null, checkedAt: now };
  }
  // Another address's read is not this one's, fresh or last good (FeedEntry.url).
  const kept = feeds.get(tenantId);
  const hit = kept && kept.url === url ? kept : undefined;
  // A fresh read (the board's Refresh) waits out only the floor; everything else, the cache.
  const ttl = opts.fresh ? FEED_FRESH_FLOOR_MS : hit?.reason ? FEED_FAIL_TTL_MS : FEED_TTL_MS;
  if (hit && Date.now() - hit.checkedAt < ttl) return asRead(hit);
  if (opts.stale && !opts.fresh && hit?.text && hit.at !== null && Date.now() - hit.at < FEED_STALE_MAX_MS) {
    if (!refreshing.has(tenantId)) {
      const behind = fetchInto(tenantId, url, hit).finally(() => refreshing.delete(tenantId));
      refreshing.set(tenantId, behind);
      // fetchInto answers a failure as a read; nothing awaits this one.
      behind.catch(() => {});
    }
    return asRead(hit);
  }
  return fetchInto(tenantId, url, hit);
}

/** Fetch the feed now and keep what came back: the text, or why not beside the last good text. */
async function fetchInto(tenantId: string, url: string, hit: FeedEntry | undefined): Promise<FeedRead> {
  const now = Date.now();
  try {
    // A calendar read through a mailbox's grant is the edge's to read (decision 0073, R20), and kept here as a link's.
    if (mailboxCalendarOf(url)) {
      const text = await grantFeedText(tenantId);
      const problem = feedBodyProblem(text);
      if (problem) throw new FeedRefused(problem);
      const fresh: FeedEntry = { url, text, at: now, checkedAt: now, reason: null, status: null };
      feeds.set(tenantId, fresh);
      return asRead(fresh);
    }
    const safe = feedUrlOk(url);
    if (!safe) throw new FeedRefused("address");
    let res: Response;
    try {
      // Every hop judged by the address rule (fetchPublic), not only the first.
      const got = await fetchPublic(publicFetcher(), safe, {
        signal: AbortSignal.timeout(8_000),
        headers: { accept: "text/calendar, */*" },
      });
      if (!got) throw new FeedRefused("address");
      res = got;
    } catch (e) {
      if (e instanceof FeedRefused) throw e;
      throw new FeedRefused("unreachable");
    }
    if (!res.ok) throw new FeedRefused("http", res.status);
    const text = await res.text();
    // The same judgement the edge makes of the same body: two readers that
    // disagreed about a ceiling would disagree about a business's own week.
    const problem = feedBodyProblem(text);
    if (problem) throw new FeedRefused(problem);
    const fresh: FeedEntry = { url, text, at: now, checkedAt: now, reason: null, status: null };
    feeds.set(tenantId, fresh);
    return asRead(fresh);
  } catch (e) {
    const reason: FeedFailure = e instanceof FeedRefused ? e.reason : "unreachable";
    const status = e instanceof FeedRefused ? e.status : null;
    log.error("ask_feed_fetch_failed", { tenant_id: tenantId, reason, status });
    const failed: FeedEntry = { url, text: hit?.text ?? null, at: hit?.at ?? null, checkedAt: now, reason, status };
    feeds.set(tenantId, failed);
    return asRead(failed);
  }
}

/** Tests: forget every cached feed, and any fetch still going on behind one. */
export function forgetFeeds(): void {
  feeds.clear();
  refreshing.clear();
}

async function fetchFeed(tenantId: string, url: string): Promise<string | null> {
  return (await loadFeed(tenantId, url)).text;
}

export interface OpeningsResult {
  state: "ok" | "no_calendar" | "unavailable";
  text: string;
  tz: string;
  days: Array<{ key: string; label: string; windows: string[] }>;
  service: { name: string; duration_min?: number } | null;
  /** With no calendar link: what the calendar is fed by instead, where anything is (contracts AskOpeningsView). */
  instead?: AskOpeningsView["instead"];
  /** Where the feed read: how full the book is (roomOf), whatever day or service was asked. Ask's calendar.room. */
  room?: { days: number; by_day: Array<{ day: string; open: number }>; taken: number };
}

/** The days the room is counted over: the first fourteen on offer, the receptionist's span until a business sets its own. */
export const ROOM_DAYS = BOOKING_DEFAULTS.max_days_ahead;

/**
 * How full the book is, for pacing an offer to what the business can take (Ask's calendar.room): the openings, every
 * day and service, counted in whole slots of the business's slot length on each day with any, over the first ROOM_DAYS
 * on offer (fewer where the business offers fewer); and `taken`, the slots the feed's busy blocks and the record's
 * (each widened by the buffer) take out of the same hours -- what the hours alone offer on the same clock and rules,
 * less what is open. A slot is the calendar's, one booking at a time: it counts no one who works there.
 */
function roomOf(
  openings: Opening[],
  free: Omit<FreeWindowsInput, "busy">,
  daysAhead: number,
): NonNullable<OpeningsResult["room"]> {
  const days = Math.min(daysAhead, ROOM_DAYS);
  const slotMs = (free.rules?.slot_min ?? BOOKING_DEFAULTS.slot_min) * MIN_MS;
  const hours = freeWindows({ ...free, busy: [], rules: { ...free.rules, max_days_ahead: days } });
  // A day with room is a day the hours offer, so the hours' days are the span.
  const span = new Set(hours.map((o) => o.key));
  const open = openings.filter((o) => span.has(o.key));
  const slots = (o: Opening) => o.windows.reduce((n, w) => n + Math.floor((w.end - w.start) / slotMs), 0);
  const total = (list: Opening[]) => list.reduce((n, o) => n + slots(o), 0);
  return { days, by_day: open.map((o) => ({ day: o.key, open: slots(o) })), taken: total(hours) - total(open) };
}

/** No link to read open times from: said with what the business does have, its booking emails or its own word. */
function noCalendar(cfg: TenantConfig | null, tz: string, service: OpeningsResult["service"]): OpeningsResult {
  const tool = bookingToolName(cfg?.bookings?.tool);
  const instead = tool ? { by: "emails" as const, tool } : cfg?.bookings?.by_hand ? { by: "hand" as const } : null;
  const text = tool
    ? `No calendar link is connected, so openings cannot be read. Bookings arrive by email from ${tool} and are on the calendar.`
    : "No calendar feed is connected, so openings cannot be read.";
  return { state: "no_calendar", text, tz, days: [], service, instead };
}

function fmtWindow(start: number, end: number, tz: string): string {
  const f = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${f.format(new Date(start))}–${f.format(new Date(end))}`;
}

/**
 * `known`: the workspace's zone and its raw settings, as the caller read them this turn (readers/openings.ts, under
 * the caller's RLS): this reads neither, and nothing else of the database -- only the calendar's feed. `taken` is the
 * caller's too: the record's taken time over the days on offer (calendar/record-busy.ts), asked for once a feed has
 * read, since the bookings a tool emailed are subtracted beside the feed's (00345).
 */
export async function openingsFor(
  tenantId: string,
  by: { day?: string | null; service?: string | null },
  now: Date,
  known: { timezone: string; config: unknown; taken: (daysAhead: number) => Promise<BusyBlock[]> },
): Promise<OpeningsResult> {
  const timezone = known.timezone;
  const cfg = parseTenantConfig(known.config);
  // The grant's calendar where one is read, else the link (contracts calendarFeedKeyOf).
  const url = calendarFeedKeyOf(cfg);
  const profile = cfg?.brain?.profile;
  // What the asked-for service is offered as, by the phone tool's rule: itself, or a consultation first (C5b).
  const offer = offerFor(profile?.services, profile?.booking_rules, by.service);
  const service = offer?.service ?? null;
  if (!url || !profile) return noCalendar(cfg, timezone, service);
  const text = await fetchFeed(tenantId, url);
  if (text === null)
    return { state: "unavailable", text: "The calendar could not be read right now.", tz: timezone, days: [], service };
  let openings: Opening[];
  let daysAhead: number;
  let room: NonNullable<OpeningsResult["room"]>;
  try {
    const rules = profile.booking_rules ?? null;
    daysAhead = rules?.max_days_ahead ?? BOOKING_DEFAULTS.max_days_ahead;
    const feed = parseIcs(text, timezone, { horizon: offeringHorizon(now, daysAhead) });
    const free = { hours: profile.hours, closures: profile.closures, tz: timezone, rules, now };
    openings = freeWindows({ ...free, busy: [...feed.busy, ...(await known.taken(daysAhead))] });
    room = roomOf(openings, free, daysAhead);
  } catch (e) {
    log.error("ask_openings_failed", { tenant_id: tenantId, error: e });
    return { state: "unavailable", text: "The calendar could not be read right now.", tz: timezone, days: [], service };
  }
  const picked = filterOpenings(openings, { day: by.day ?? null, minMinutes: offer?.minMinutes ?? null });
  const described = describeOpenings(picked, timezone, {
    maxDays: 3,
    daysAhead,
    hasBookingLink: offersBookingLink(cfg?.brain),
  });
  return {
    state: "ok",
    text: `${offerLead(offer)}${described}`,
    tz: timezone,
    days: picked.slice(0, 5).map((o) => ({
      key: o.key,
      label: o.label,
      windows: o.windows.slice(0, 6).map((w) => fmtWindow(w.start, w.end, timezone)),
    })),
    service,
    room,
  };
}
