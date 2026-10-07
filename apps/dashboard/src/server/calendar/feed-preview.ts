/**
 * A calendar feed checked before its address is saved: reached under the address rule, read as iCal, and its next
 * few taken blocks said in the business's zone. The preview route calls it; nothing is stored.
 */
import "server-only";
import {
  AppError,
  FEED_MAX_BYTES,
  feedProblemWords,
  feedUrlOk,
  fetchPublic,
  parseIcs,
  previewHorizon,
} from "@chanlytics/contracts";
import { publicFetcher } from "@chanlytics/channels";

/** The address rule is contracts' (feed-url.ts); re-exported so the settings routes' test reaches it at the door that uses it. */
export { feedUrlOk };

const FEED_TIMEOUT_MS = 8_000;

/* ---- A feed checked before it is saved ---- */

interface FeedPreview {
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
    // Every hop judged by the address rule (fetchPublic), not only the first.
    const res = await fetchPublic(publicFetcher(), safe, {
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      headers: { accept: "text/calendar, */*" },
    });
    if (!res)
      throw new AppError("validation", feedProblemWords("address") ?? "Not an address the receptionist may read.");
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
