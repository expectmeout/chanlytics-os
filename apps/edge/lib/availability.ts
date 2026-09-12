/**
 * The openings a receptionist can state, from the workspace's calendar feed.
 *
 * The feed is the owner's appointments as iCal — what Booksy Biz, Calendly,
 * Square and the rest write into a Google or Apple calendar, read back by
 * its private address. It is fetched here, on the edge, with a short cache:
 * a busy line asks many times a minute and the calendar does not change that
 * fast. Everything else — parsing, the opening hours, the buffer and lead
 * rules, the words — is the pure contracts module, so it is tested without
 * a network.
 *
 * Never throws and never blocks a reply: a feed that cannot be read means
 * the receptionist says nothing about open times (the link still works),
 * and the failure is logged where the diagnostic can find it.
 */
import { parseIcs, freeWindows, describeOpenings, describeVisits, feedUrlOk, feedBodyProblem, seasonHorizon, visitsOf, type FeedItem, type Opening, type ParsedFeed } from "./workspace/contracts.js";
import type { TenantRuntime } from "./tenant-runtime.js";

const CACHE_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;

interface Cached { text: string | null; at: number; parsed: ParsedFeed | null }
const feeds = new Map<string, Cached>();

/** webcal:// is https:// in a hat. */
function httpsUrl(u: string): string {
  return u.replace(/^webcal:\/\//i, "https://");
}

async function fetchFeed(tenantId: string, url: string): Promise<string | null> {
  const hit = feeds.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  let text: string | null = null;
  try {
    // The same address rule the dashboard's preview and save keep: never a
    // private address, however it reached the config.
    const safe = feedUrlOk(url);
    if (!safe) throw new Error("address refused: not a public https/webcal address");
    const r = await fetch(httpsUrl(safe), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "text/calendar, text/plain;q=0.5, */*;q=0.1" } });
    if (!r.ok) {
      console.error("availability_feed_http", JSON.stringify({ tenant: tenantId, status: r.status }));
    } else {
      const body = await r.text();
      // One ceiling, one judgement, shared with the dashboard's loader: this
      // inlined 2 * 1024 * 1024 while the dashboard refused at FEED_MAX_BYTES,
      // so a feed between the two was read by one reader and refused by the
      // other, and the receptionist and the board would then disagree about a
      // business's own week with nothing on any page to say why.
      const problem = feedBodyProblem(body);
      if (problem === "too_large") console.error("availability_feed_too_large", JSON.stringify({ tenant: tenantId, bytes: body.length }));
      else if (problem === "not_ical") console.error("availability_feed_not_ical", JSON.stringify({ tenant: tenantId, head: body.slice(0, 40) }));
      else text = body;
    }
  } catch (e) {
    console.error("availability_feed_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
  }
  // A failure is cached too, briefly: one broken feed must not add a six
  // second wait to every message for as long as it stays broken.
  feeds.set(tenantId, { text, at: Date.now(), parsed: null });
  return text;
}

/**
 * The feed parsed once per fetch. The openings, a caller's visits and the
 * hourly sweep all read it, and parsing a season of appointments each time
 * is the work the five-minute cache exists to avoid.
 */
async function parsedFeedOf(tenantId: string, url: string, tz: string, daysAhead: number, now: Date): Promise<ParsedFeed | null> {
  const text = await fetchFeed(tenantId, url);
  if (text === null || !tz) return null;
  const hit = feeds.get(tenantId);
  if (hit?.parsed && hit.text === text) return hit.parsed;
  const parsed = parseIcs(text, tz, { horizon: seasonHorizon(now, daysAhead) });
  if (hit && hit.text === text) hit.parsed = parsed;
  return parsed;
}

async function parsedFeed(rt: TenantRuntime, url: string, now: Date): Promise<ParsedFeed | null> {
  return parsedFeedOf(rt.tenantId, url, rt.timezone ?? "", rt.brain?.profile?.booking_rules?.max_days_ahead ?? 14, now);
}

/** The feed's appointments for one workspace, for the sweep that puts the people they name in People. Null when the feed cannot be read. */
export async function feedItemsFor(tenantId: string, url: string, tz: string, now = new Date(), daysAhead = 14): Promise<FeedItem[] | null> {
  const parsed = await parsedFeedOf(tenantId, url, tz, daysAhead, now);
  return parsed ? parsed.items : null;
}

/** The openings as data, for the phone tool that answers about one day. */
export interface OpeningsData {
  openings: Opening[];
  tz: string;
  daysAhead: number;
}

/**
 * The openings, or null when there is nothing to say — no feed configured,
 * or a feed that could not be read.
 */
export async function openingsData(rt: TenantRuntime, now = new Date()): Promise<OpeningsData | null> {
  const url = rt.calendar?.ical_url;
  const profile = rt.brain?.profile;
  if (!url || !profile || !rt.timezone) return null;
  try {
    const feed = await parsedFeed(rt, url, now);
    if (!feed) return null;
    const rules = profile.booking_rules ?? null;
    const daysAhead = rules?.max_days_ahead ?? 14;
    const openings = freeWindows({ hours: profile.hours, closures: profile.closures, tz: rt.timezone, busy: feed.busy, rules, now });
    if (feed.skippedRecurring) console.log("availability_recurring_skipped", JSON.stringify({ tenant: rt.tenantId, count: feed.skippedRecurring }));
    return { openings, tz: rt.timezone, daysAhead };
  } catch (e) {
    console.error("availability_compute_failed", JSON.stringify({ tenant: rt.tenantId, error: e instanceof Error ? e.message : String(e) }));
    return null;
  }
}

/** The openings block for the prompt, or null when there is nothing to say. */
export async function openingsFor(rt: TenantRuntime, now = new Date()): Promise<string | null> {
  const data = await openingsData(rt, now);
  return data ? describeOpenings(data.openings, data.tz, { daysAhead: data.daysAhead }) : null;
}

/** Tests and the diagnostic: forget every cached feed. */
export function forgetFeeds(): void {
  feeds.clear();
}

/**
 * What the calendar says about the person on the line: their next
 * appointment and their last visit, matched by their number first and
 * their name second — the same match the dashboard's board and profile
 * use. Null when there is nothing to say; never throws.
 */
export async function visitsFor(rt: TenantRuntime, who: { phone: string | null; name: string | null }, now = new Date()): Promise<string | null> {
  const url = rt.calendar?.ical_url;
  if (!url || !rt.timezone || (!who.phone && !who.name)) return null;
  try {
    const feed = await parsedFeed(rt, url, now);
    if (!feed) return null;
    return describeVisits(visitsOf(feed.items, { id: "caller", name: who.name ?? "", phone: who.phone }, now.getTime()), rt.timezone, now.getTime());
  } catch (e) {
    console.error("availability_visits_failed", JSON.stringify({ tenant: rt.tenantId, error: e instanceof Error ? e.message : String(e) }));
    return null;
  }
}
