import "server-only";
import {
  describeOpenings,
  feedBodyProblem,
  feedUrlOk,
  fetchPublic,
  filterOpenings,
  freeWindows,
  offerFor,
  offerLead,
  offeringHorizon,
  offersBookingLink,
  parseIcs,
  parseTenantConfig,
  type FeedFailure,
  type Opening,
} from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import { tenantFacts } from "../tenant";
import { fillerFeedFor } from "../calendar/filler-calendar";

/**
 * Openings for the assistant and the palette's fast path, computed the way
 * the phone receptionist computes them (edge availability.ts): the calendar
 * feed's busy blocks against the business's hours, closures and booking
 * rules, in the business's zone. Read under the caller's RLS; the feed URL
 * is fetched server-side and never sent to the browser.
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
  const hit = feeds.get(tenantId);
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
    const safe = feedUrlOk(url);
    if (!safe) throw new FeedRefused("address");
    let res: Response;
    try {
      // Every hop judged by the address rule (fetchPublic), not only the first.
      const got = await fetchPublic(fetch, safe, {
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
    const fresh: FeedEntry = { text, at: now, checkedAt: now, reason: null, status: null };
    feeds.set(tenantId, fresh);
    return asRead(fresh);
  } catch (e) {
    const reason: FeedFailure = e instanceof FeedRefused ? e.reason : "unreachable";
    const status = e instanceof FeedRefused ? e.status : null;
    console.error("ask_feed_fetch_failed", JSON.stringify({ tenant: tenantId, reason, status }));
    const failed: FeedEntry = { text: hit?.text ?? null, at: hit?.at ?? null, checkedAt: now, reason, status };
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
}

function fmtWindow(start: number, end: number, tz: string): string {
  const f = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
  return `${f.format(new Date(start))}–${f.format(new Date(end))}`;
}

/**
 * `known`: the workspace's zone and its raw settings, handed in by a caller that read them this turn
 * (readers/openings.ts), so neither is read again; without it, both are read here.
 */
export async function openingsFor(
  ctx: RouteContext,
  tenantId: string,
  by: { day?: string | null; service?: string | null },
  now = new Date(),
  known?: { timezone: string; config: unknown },
): Promise<OpeningsResult> {
  let timezone: string;
  let raw: unknown;
  if (known) {
    timezone = known.timezone;
    raw = known.config;
  } else {
    ({ timezone } = await tenantFacts(ctx.supabase, tenantId));
    const { data: row, error } = await ctx.supabase
      .from("tenant_config")
      .select("config")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    raw = row?.config ?? null;
  }
  const cfg = parseTenantConfig(raw);
  const url = cfg?.calendar?.ical_url;
  const profile = cfg?.brain?.profile;
  // What the asked-for service is offered as, by the phone tool's rule: itself, or a consultation first (C5b).
  const offer = offerFor(profile?.services, profile?.booking_rules, by.service);
  const service = offer?.service ?? null;
  if (!url || !profile)
    return {
      state: "no_calendar",
      text: "No calendar feed is connected, so openings cannot be read.",
      tz: timezone,
      days: [],
      service,
    };
  const text = await fetchFeed(tenantId, url);
  if (text === null)
    return { state: "unavailable", text: "The calendar could not be read right now.", tz: timezone, days: [], service };
  let openings: Opening[];
  let daysAhead: number;
  try {
    const rules = profile.booking_rules ?? null;
    daysAhead = rules?.max_days_ahead ?? 14;
    const feed = parseIcs(text, timezone, { horizon: offeringHorizon(now, daysAhead) });
    openings = freeWindows({
      hours: profile.hours,
      closures: profile.closures,
      tz: timezone,
      busy: feed.busy,
      rules,
      now,
    });
  } catch (e) {
    console.error(
      "ask_openings_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
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
  };
}
