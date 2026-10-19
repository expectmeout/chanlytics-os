/**
 * The counts of the lists this member pinned to Today (the wiring's second audit, R10, W-person-list-lead-3). A pinned chip
 * drew People's count as of People's last read, and People is not read again on Today: a customer writing, a hold opening or
 * someone new getting in touch moved the queue above the chips at once and left their numbers where they were.
 *
 * GET people/list-counts counts each pinned list on the server, over the pool People's lists are counted on, for the member
 * looking (readers/audience-pool.ts listCounts): the same rule as People's rail, without People's whole book. Read on Today alone, where
 * the chips are drawn, and only when something is pinned; heard there for what the lists are made of, and waited out as a
 * dear read is, since each is a read of everyone on the server.
 */
import { pinTokens, type ListCountsDto } from "@chanlytics/contracts";
import { read } from "@/legacy-bridge/api";
import { readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { DEAR_READ_LONGEST_WAIT_MS } from "@/legacy-bridge/surface-realtime";
import { setSurfaceValue, surfaceValue } from "../surface-values";

/** The pinned lists' counts by token, the tokens they were read for, and when. */
export interface TodayPinsSurface {
  counts: ListCountsDto["counts"];
  tokens: string;
  fetchedAt: number;
}

/** The tokens this member's Today keeps now, as People's read of their views holds them. */
const pinnedNow = (): string => pinTokens(surfaceValue("people")?.views?.today).join(",");

export const todayPinsOverride: SurfaceOverride = {
  key: "today_pins",
  value: "today_pins",
  events: ["surface:today_pins"],
  // What the lists are made of: who is in People and what they answered, their threads, holds and calls, their visits, steps
  // and deals, the lists kept by hand, what the workspace can send on (a list of who can be reached) and the settings the
  // calendar's visits are read with, and the workspace's own row (its zone and its word for a booking). Heard while
  // Today is on screen, and once as it comes back.
  ...declareReads("today_pins", {
    reads: ["person", "conversation", "hold", "call", "visit", "step", "deal", "list", "channel", "facts", "workspace"],
    fresh: "its-page",
    omit: [
      {
        tables: ["mailbox_connections", "capability_activations", "business_records"],
        why: "who can be reached is counted against the number, the line and the mailbox (channels ready); a connected mailbox, an activation or the carriers' record counts nobody",
      },
      {
        tables: ["appointment_notices"],
        why: "a booking email held for a look is not on the calendar: the lists count the appointments there",
      },
    ],
  }),
  onDemand: true,
  // Aged, or read for other pins than the member keeps now (a pin added or taken off on People).
  isStale: () => {
    const held = surfaceValue("today_pins");
    return readAged(held?.fetchedAt) || held?.tokens !== pinnedNow();
  },
  // Each read is a read of everyone on the server: a stream of changes is waited out, as People's is.
  debounceMs: 2_000,
  maxWaitMs: DEAR_READ_LONGEST_WAIT_MS,
  apply: async () => {
    const tokens = pinnedNow();
    // Nothing pinned, or People's views not read yet: nothing to count, and nothing asked of the server. A member who pins
    // nothing pays for no read, whatever moves the lists.
    if (!tokens) {
      setSurfaceValue("today_pins", { counts: {}, tokens, fetchedAt: Date.now() });
      return;
    }
    const data = await read("GET people/list-counts", { query: { lists: tokens } });
    setSurfaceValue("today_pins", { counts: data.counts, tokens, fetchedAt: Date.now() });
  },
};
