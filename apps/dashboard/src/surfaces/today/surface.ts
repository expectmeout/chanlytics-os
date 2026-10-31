/**
 * Today's read: the day's figures and queue, read from the metrics, the threads, the escalations, the calls and the lead
 * searches, and made into the day (contracts toTodayVM). The surface as the frame registers it (what it reads and hears) is
 * override.ts, which fetches this module as the surface is first read: imported whole, every page's first load carried
 * the day's whole making (the loadability review, 19 Oct 2026). Part of the SurfaceData seam (../surface-data.ts).
 */

import { read } from "@/legacy-bridge/api";
import { heldThreadIds, toTodayVM, type CallDto, type LeadSearchDto } from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { setSurfaceValue, shareUnchanged, surfaceValue } from "../surface-values";
import { readHeldThreads } from "../inbox/read-apart";

/** What Today is made of: the five reads, and the threads of the holds past the hundred, as `toTodayVM` takes them. */
type TodayArgs = Parameters<typeof toTodayVM>;
interface TodayHeld {
  metrics: TodayArgs[0];
  conversations: TodayArgs[1];
  escalations: TodayArgs[2];
  calls: TodayArgs[3];
  searches: TodayArgs[5];
  beside: TodayArgs[6];
}

/**
 * What Today's last read held, kept so the clock can make the day again from it with no read (`rederive`): a window that
 * drops under six hours, a message an hour unanswered, a search's wait and a hold's end are the clock's, and no notice comes
 * for them, least of all when nothing arrives, which is when they matter (the wiring's second audit, S2-2).
 */
let lastHeld: TodayHeld | null = null;

/** The day from what was read, at `now`, published where anything moved; whether it did. */
function publishToday(h: TodayHeld, now: Date): boolean {
  const was = surfaceValue("today");
  const vm = shareUnchanged(
    was,
    toTodayVM(h.metrics, h.conversations, h.escalations, h.calls, now, h.searches, h.beside),
  );
  if (vm === was) return false;
  setSurfaceValue("today", vm);
  return true;
}

/** The rows that come and go by the clock alone, made again from what the last read held (override.ts `rederive`). */
export function rederiveToday(now: Date): boolean {
  return lastHeld ? publishToday(lastHeld, now) : false;
}

/**
 * The read: the five, then the threads of the holds past the hundred, made into the day. Unlike every other surface, this
 * one has NO seed to fall back to (override.ts says why).
 */
export const applyToday: SurfaceOverride["apply"] = async () => {
  // Calls are additive context, not a precondition — a voice outage must not
  // blank the brief — but they are fetched WITH the others rather than
  // waterfalled behind them, so the slowest request sets the wall clock.
  const [metricsRes, convData, escData, callsRes, searchesRes, triedRes] = await Promise.all([
    read("GET metrics", { query: { days: "1" } }),
    read("GET conversations"),
    read("GET escalations", { query: { state: "open" } }),
    read("GET calls").catch((e: unknown) => e as Error),
    read("GET lead-searches").catch((e: unknown) => e as Error),
    // The leads who tried their own receptionist (decision 0079): additive, as the searches are.
    read("GET lead-previews").catch((e: unknown) => e as Error),
  ]);
  // Null, not []: a calls read that failed is its own state, and the brief
  // says so rather than counting none.
  let calls: CallDto[] | null = null;
  try {
    if (callsRes instanceof Error) throw callsRes;
    calls = callsRes.calls;
  } catch (e) {
    console.error("today_calls_fetch_failed", e instanceof Error ? e.message : e);
  }
  // The searches the same way (spec G7): a search waiting on the owner is a
  // queue row; a failed read is null and the brief stands without it.
  let searches: LeadSearchDto[] | null = null;
  try {
    if (searchesRes instanceof Error) throw searchesRes;
    searches = searchesRes.searches;
  } catch (e) {
    console.error("today_searches_fetch_failed", e instanceof Error ? e.message : e);
  }
  // The threads of open holds past the hundred, by their ids, the Inbox's own read (one rule, one read): a hold whose
  // thread is older than the page is judged by its own standing and named, as the Inbox judges it (S7-7). Read only
  // where there is one; a read that failed leaves each counted as waiting (unknown is not handled).
  const ids = heldThreadIds(new Set(convData.conversations.map((c) => c.id)), escData.escalations);
  const heldThreads = await readHeldThreads(ids);
  if (heldThreads === null) console.error("today_held_threads_fetch_failed", ids.length);
  // The brief is said here without the runs: the page holds Sent's runs and says the head with them (today-head.tsx).
  lastHeld = {
    metrics: metricsRes.metrics,
    conversations: convData.conversations,
    escalations: escData.escalations,
    calls,
    searches,
    beside: { heldThreads, previewsTried: triedRes instanceof Error ? null : triedRes.previews },
  };
  publishToday(lastHeld, new Date());
  // Today publishes no count for the badge, the tabs, the title or the phone. It used to send one after every read
  // (metrics.now.escalations_open, then threadStanding alone, then the newest page alone, then threadsWaitingOnYou), each a
  // different number from the Inbox's chip, over the Inbox's own: a reply held in the Inbox's tab, before the cancel's
  // re-read, was the Inbox's alone, and whichever sent last was on screen. They all read one selector now (needs-you.ts);
  // the headline above keeps the wire rule for its threads (contracts threadsWaitingOnYou), which is the same rule.
  // The day stands without the calls or the searches, and says so; the runner asks for them again (the wiring's second audit,
  // S2-5: a read that lost part of itself counted as landed, and nothing asked again).
  return callsRes instanceof Error || searchesRes instanceof Error ? "partial" : undefined;
};
