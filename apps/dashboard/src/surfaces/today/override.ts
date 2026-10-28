/**
 * Today's surface as the frame registers it: what it reads and hears, and when it is made again, here; the read itself
 * and the day's making in surface.ts, fetched as the surface is first read (code-once.ts). Every page reads Today (it
 * is live), after its own page's surfaces, so its code is fetched beside its reads instead of parsed before any page could
 * draw (the loadability review, 19 Oct 2026).
 */
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { isLiveCallTurn } from "@/legacy-bridge/surface-realtime";
import { surfaceCode } from "@/legacy-bridge/surfaces/code";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { declareSurfaceValue } from "../surface-values";
// The Setup card's code, which Today's first draw waits for where Today is the page the tab opens on: said as the frame
// loads, before its gate first opens (setup-card-code.ts).
import "./setup-card-code";

// The pages that have not moved (Ask, the phone app's bridge, the bell) still read the day under its old name.
declareSurfaceValue("today", "TODAY_DATA");

/** Today's read and the day's making: fetched once, at once where Today is the page opened (legacy-bridge/surfaces/code.ts). */
const todayCode = surfaceCode("today", () => import("./surface"));

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
  // Nothing before the first read, which brings the code (todayCode) and what the clock makes the day again from.
  rederive: (now) => todayCode.now()?.rederiveToday(now) ?? false,
  apply: async (heard) => (await todayCode()).applyToday(heard),
};
