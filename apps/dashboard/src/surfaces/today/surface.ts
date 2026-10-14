/**
 * Today's override: the day's figures and queue, read from the metrics, the
 * threads, the escalations, the calls and the lead searches. Part of the
 * SurfaceData seam (../surface-data.ts); its sibling surfaces are the other
 * modules in this folder.
 */

import { read } from "@/legacy-bridge/api";
import { isLiveCallTurn } from "@/legacy-bridge/surface-realtime";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { heldThreadIds, toTodayVM, type CallDto, type LeadSearchDto } from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareSurfaceValue, setSurfaceValue, shareUnchanged, surfaceValue } from "../surface-values";
import { readHeldThreads } from "../inbox/held-threads";

// The pages that have not moved (Ask, the phone app's bridge, the bell) still read the day under its old name.
declareSurfaceValue("today", "TODAY_DATA");

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
  value: "today",
  events: ["surface:today"],
  refreshOnMessageInserts: true,
  // Calls too: the brief now shows who is on the line, and a call that ends
  // must leave it. The default trio never included the calls table — and the
  // transcript turn every few seconds (an UPDATE that keeps the status
  // ongoing) must NOT re-run three plpgsql aggregates; a start or an end does.
  // Lead rounds too: a search that stops to ask is an UPDATE on its round, and
  // its answer another. A round is told when its state, its question, its wait or
  // its ending moved (00431), never for the counters each batch of a run moves:
  // each one told changes what the queue says about a search waiting on you.
  // And the channel, the line and the billing account: the chips for WhatsApp, text, voice and email and the red bands
  // ('WhatsApp is disconnected', 'This workspace is paused') are drawn from the metrics read, which nothing re-read for a
  // number that failed, a line that registered, a mailbox made (the email chip is drawn where one exists) or a subscription that
  // ended. billing_accounts is written in the same
  // transaction as the workspace's status (00382), so it stands for the pause. They change a few times a month.
  // And the person each row of the queue names (contacts, 0047): a teammate's rename, their address, a yes or a stop. A few a
  // day. Its other configuration, the hours the settings hold, it does not draw: the five reads below name none.
  ...declareReads("today", {
    reads: ["conversation", "hold", "call", "lead", "channel", "billing", "person"],
    fresh: "live",
    omit: [
      {
        tables: ["leads", "lead_searches", "lead_search_members"],
        why: "the queue draws a search waiting on you, which its round says (a stop to ask, its answer); the leads it found and the people it kept are not in it",
      },
      {
        tables: ["mailbox_connections", "capability_activations", "business_records"],
        why: "the chips and bands draw a channel's number, its line, the mailbox and the workspace's pause, not a connected mailbox, an activation or the record the carriers read",
      },
    ],
    // A transcript turn of a call in progress is an update that changes nothing the day counts (isLiveCallTurn); asked first.
    when: (c) => !isLiveCallTurn(c),
  }),
  // A send that fails, even long after it left, is a count on the day (the metrics' send_failures, 00327): the one
  // message update Today is read again for. A receipt's ticks are the threads', and the day's figures do not move
  // with them.
  refreshOnMessageStatuses: ["failed"],
  debounceMs: 800, // the recap is aggregate, not per-thread — no need to be twitchy
  // "Today so far" is one read of the business's day (metrics for one day): nothing else moves it at midnight, and a tab left
  // open overnight said yesterday's totals until its first message of the new day.
  readAtMidnight: true,
  // And the rows that come and go by the clock alone, made again each minute while Today is on screen (hearing/clock.ts).
  rederive: (now) => (lastHeld ? publishToday(lastHeld, now) : false),
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
      beside: { heldThreads },
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
  },
};
