/**
 * Today's override: the day's figures and queue, read from the metrics, the
 * threads, the escalations, the calls and the lead searches. Part of the
 * SurfaceData seam (../surface-data.ts); its sibling surfaces are the other
 * modules in this folder.
 */

import { read } from "../api";
import { DEFAULT_REFRESH_TABLES } from "../surface-realtime";
import { threadStanding, toTodayVM, type CallDto, type LeadSearchDto, type TodayVM } from "@chanlytics/contracts";
import type { SurfaceOverride } from "../surface-data";

/**
 * Slice 4: Today. Unlike every other surface, this one has NO seed to fall back
 * to — TODAY_DATA does not exist until a fetch succeeds. That is deliberate:
 * the seeded Today rendered "$1,840 revenue · 12 appointments · on pace to
 * clear $4,200", so a failed fetch falling back to seeds would show fabricated
 * revenue at the exact moment the app knows nothing. Undefined makes the page
 * say "can't reach your workspace" instead.
 *
 * A DEGRADED refresh (was live, refresh failed) keeps the last real payload,
 * which is correct — the data is true but stale, and the bridge pill says so.
 */
export const todayOverride: SurfaceOverride = {
  key: "today",
  globals: ["TODAY_DATA"],
  events: ["surface:today"],
  refreshOnMessageInserts: true,
  // Calls too: the brief now shows who is on the line, and a call that ends
  // must leave it. The default trio never included the calls table — and the
  // transcript turn every few seconds (an UPDATE that keeps the status
  // ongoing) must NOT re-run three plpgsql aggregates; a start or an end does.
  // Lead rounds too: a search that stops to ask is an UPDATE on its round, and
  // its answer another. Every lead_rounds change goes through — they are rare
  // and each one changes what the queue says about a search waiting on you.
  refreshOnTables: [...DEFAULT_REFRESH_TABLES, "calls", "lead_rounds"],
  refreshWhen: (c) => c.table !== "calls" || c.event !== "UPDATE" || c.row.status !== "ongoing",
  debounceMs: 800, // the recap is aggregate, not per-thread — no need to be twitchy
  apply: async () => {
    // Calls are additive context, not a precondition — a voice outage must not
    // blank the brief — but they are fetched WITH the others rather than
    // waterfalled behind them, so the slowest request sets the wall clock.
    const [metricsRes, convData, escData, callsRes, searchesRes] = await Promise.all([
      read("GET metrics", { query: { days: "1" } }),
      read("GET conversations"),
      read("GET escalations", { query: { state: "open" } }),
      read("GET calls").catch((e: unknown) => e as Error),
      read("GET lead-searches").catch((e: unknown) => e as Error),
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
    (window as unknown as { TODAY_DATA?: TodayVM }).TODAY_DATA = toTodayVM(
      metricsRes.metrics,
      convData.conversations,
      escData.escalations,
      calls,
      new Date(),
      searches,
    );

    // The sidebar badge is seeded until the Inbox itself mounts, so a fresh
    // load put a fabricated "6" one inch from Today's honest "0 need you".
    // Today already holds the real rows — publish the count. Detail is
    // REQUIRED: a detail-less inbox:counts zeroes the badge instead of
    // correcting it.
    //
    // Counted with threadStanding, the same rule the Inbox itself uses. This
    // used to publish metrics.now.escalations_open, which is a DIFFERENT
    // number — it counts open escalations including ones a teammate has already
    // claimed, so it read high exactly when someone was doing the work, and
    // then overwrote the Inbox's correct count on every Today refresh.
    const openByConv = new Map(escData.escalations.map((e) => [e.conversation_id, e]));
    const needs = convData.conversations.filter((c) => threadStanding(c, openByConv.get(c.id) ?? null).needsYou).length;
    window.dispatchEvent(new CustomEvent("inbox:counts", { detail: { needs } }));
  },
};
