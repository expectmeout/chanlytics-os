/**
 * The calendar's feed parsed once per fetch: the cache the board (calendar-week.ts), a profile (person-visits.ts), and
 * the People list and the report (people-visits.ts) read through, over the loader's own cache (ask/openings.ts).
 */
import "server-only";
import { parseIcs, seasonHorizon, type FeedFailure, type ParsedFeed } from "@chanlytics/contracts";
import { loadFeed } from "@/server/ask/openings";

/**
 * The feed parsed once per fetch. The board, a profile, the People list and
 * the report all read it; `loadFeed` caches the text for a few minutes and
 * this caches its parse for as long as the text is the same one.
 */
const parsedFeeds = new Map<string, { text: string; tz: string; parsed: ParsedFeed }>();

export interface ParsedRead {
  /** Null when there has never been a good read. */
  parsed: ParsedFeed | null;
  at: number | null;
  /** Why the latest try failed; with a parse it means the parse is the last good read. */
  reason: FeedFailure | null;
  status: number | null;
  /** When the calendar was last tried, good or not; null when it never was. */
  checkedAt: number | null;
}

/** `fresh`: the board's Refresh (C2). `stale`: a reader that may take the last good read while a new one is fetched (openings.ts). */
export async function parsedFeedFor(
  tenantId: string,
  url: string,
  tz: string,
  now: Date,
  opts: { fresh?: boolean; stale?: boolean } = {},
): Promise<ParsedRead> {
  const feed = await loadFeed(tenantId, url, opts);
  if (!feed.text)
    return { parsed: null, at: null, reason: feed.reason, status: feed.status, checkedAt: feed.checkedAt };
  const hit = parsedFeeds.get(tenantId);
  if (hit && hit.text === feed.text && hit.tz === tz)
    return { parsed: hit.parsed, at: feed.at, reason: feed.reason, status: feed.status, checkedAt: feed.checkedAt };
  const parsed = parseIcs(feed.text, tz, { horizon: seasonHorizon(now) });
  parsedFeeds.set(tenantId, { text: feed.text, tz, parsed });
  return { parsed, at: feed.at, reason: feed.reason, status: feed.status, checkedAt: feed.checkedAt };
}
