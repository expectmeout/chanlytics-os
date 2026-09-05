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
import { parseIcs, freeWindows, describeOpenings } from "./workspace/contracts.js";
import type { TenantRuntime } from "./tenant-runtime.js";

const CACHE_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 6000;
const MAX_BYTES = 2 * 1024 * 1024;

interface Cached { text: string | null; at: number }
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
    const r = await fetch(httpsUrl(url), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { accept: "text/calendar, text/plain;q=0.5, */*;q=0.1" } });
    if (!r.ok) {
      console.error("availability_feed_http", JSON.stringify({ tenant: tenantId, status: r.status }));
    } else {
      const body = await r.text();
      if (body.length > MAX_BYTES) console.error("availability_feed_too_large", JSON.stringify({ tenant: tenantId, bytes: body.length }));
      else if (!/BEGIN:VCALENDAR/i.test(body)) console.error("availability_feed_not_ical", JSON.stringify({ tenant: tenantId, head: body.slice(0, 40) }));
      else text = body;
    }
  } catch (e) {
    console.error("availability_feed_failed", JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }));
  }
  // A failure is cached too, briefly: one broken feed must not add a six
  // second wait to every message for as long as it stays broken.
  feeds.set(tenantId, { text, at: Date.now() });
  return text;
}

/**
 * The openings block for the prompt, or null when there is nothing to say —
 * no feed configured, or a feed that could not be read.
 */
export async function openingsFor(rt: TenantRuntime, now = new Date()): Promise<string | null> {
  const url = rt.calendar?.ical_url;
  const profile = rt.brain?.profile;
  if (!url || !profile || !rt.timezone) return null;
  const text = await fetchFeed(rt.tenantId, url);
  if (text === null) return null;
  try {
    const feed = parseIcs(text, rt.timezone);
    const rules = profile.booking_rules ?? null;
    const openings = freeWindows({ hours: profile.hours, closures: profile.closures, tz: rt.timezone, busy: feed.busy, rules, now });
    if (feed.skippedRecurring) console.log("availability_recurring_skipped", JSON.stringify({ tenant: rt.tenantId, count: feed.skippedRecurring }));
    return describeOpenings(openings, rt.timezone, { daysAhead: rules?.max_days_ahead ?? 14 });
  } catch (e) {
    console.error("availability_compute_failed", JSON.stringify({ tenant: rt.tenantId, error: e instanceof Error ? e.message : String(e) }));
    return null;
  }
}

/** Tests and the diagnostic: forget every cached feed. */
export function forgetFeeds(): void {
  feeds.clear();
}
