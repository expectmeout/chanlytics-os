/**
 * Today's override: the day's figures and queue, read from the metrics, the
 * threads, the escalations, the calls and the lead searches. Part of the
 * SurfaceData seam (../surface-data.ts); its sibling surfaces are the other
 * modules in this folder.
 */

import { read } from "@/legacy-bridge/api";
import { isLiveCallTurn } from "@/legacy-bridge/surface-realtime";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { toTodayVM, type CallDto, type LeadSearchDto } from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareSurfaceValue, setSurfaceValue } from "../surface-values";

// The pages that have not moved (Ask, the phone app's bridge, the bell) still read the day under its old name.
declareSurfaceValue("today", "TODAY_DATA");

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
  // its answer another. Every lead_rounds change goes through — they are rare
  // and each one changes what the queue says about a search waiting on you.
  // And the channel, the line and the billing account: the chips for WhatsApp, text, voice and email and the red bands
  // ('WhatsApp is disconnected', 'This workspace is paused') are drawn from the metrics read, which nothing re-read for a
  // number that failed, a line that registered or a subscription that ended. billing_accounts is written in the same
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
        tables: ["mailboxes", "sending_domains", "capability_activations", "business_records"],
        why: "the chips and bands draw a channel's number, its line and the workspace's pause, not the mailbox's offers, a domain, an activation or the record the carriers read",
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
    const now = new Date();
    setSurfaceValue(
      "today",
      toTodayVM(metricsRes.metrics, convData.conversations, escData.escalations, calls, now, searches),
    );
    // Today publishes no count for the badge, the tabs, the title or the phone. It used to send one after every read
    // (metrics.now.escalations_open, then threadStanding alone, then the newest page alone, then threadsWaitingOnYou), each a
    // different number from the Inbox's chip, over the Inbox's own: a reply held in the Inbox's tab, before the cancel's
    // re-read, was the Inbox's alone, and whichever sent last was on screen. They all read one selector now (needs-you.ts);
    // the headline above keeps the wire rule for its threads (contracts threadsWaitingOnYou), which is the same rule.
  },
};
