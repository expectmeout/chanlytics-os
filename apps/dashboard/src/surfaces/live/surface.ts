/**
 * Live's override: the phone line right now. Part of the SurfaceData seam
 * (../surface-data.ts).
 */

import { read } from "@/legacy-bridge/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import { MIN_MS, toLiveVM, type CallDto, type LiveVM } from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { isLiveCallTurn } from "@/legacy-bridge/surface-realtime";
import { declareReads, keepForItsPage, ownsTheScreen } from "@/legacy-bridge/surface-registry";
import { routeOnScreen } from "@/legacy-bridge/workspace";
import { channelsHeld, followChannels } from "../channels/surface";
import { declareSurfaceValue, setSurfaceValue } from "../surface-values";

/** The phone line right now: the calls in progress and the ones that just ended, with the line's number and switch. */
export type LiveSurface = LiveVM;

// The frame (its top bar, its tab strip and the first run) and Ask read this under its old name until they move.
declareSurfaceValue("live", "__LIVE");

/** The calls and the zone Live was last made of: its line is made again of them as the channels read is published. */
let made: { calls: CallDto[]; tz: string } | null = null;
/** When Live's last read landed: a turn of a call heard elsewhere reads it again only once this is old (callTurnHeard). */
let readAtMs = 0;

/**
 * How old Live's read may be before a turn of a call heard on another page reads it again: what the rest of the app draws of a
 * call is that it is on, and for how long, which its start and its end say; a read of its words five minutes old keeps the top
 * bar and Today's line honest while a long call runs.
 */
const TURNS_HEARD_AWAY_AFTER_MS = 5 * MIN_MS;

/**
 * Whether a change of the calls is Live's to read now: a call starting, ending or filed again, wherever the tab is; a transcript
 * turn of one under way only on Live's own page, or once Live's read has aged, and kept for its page otherwise. Every turn, every
 * few seconds, read the newest hundred calls with their transcripts on whatever page was open (the wiring's second audit, S10-4).
 */
function callTurnHeard(c: Parameters<typeof isLiveCallTurn>[0]): boolean {
  if (!isLiveCallTurn(c)) return true;
  if (ownsTheScreen("live", routeOnScreen()) || Date.now() - readAtMs > TURNS_HEARD_AWAY_AFTER_MS) return true;
  keepForItsPage("live");
  return false;
}

// The line's number and its switch are the channels read's (channels/surface.ts), which hears the channel rows wherever the tab
// is: a line connected or switched off elsewhere repaints Live as it lands, with no read of Live's own.
followChannels("live", (held, rows) => (made ? toLiveVM(made.calls, rows, made.tz) : held));

/**
 * Live — the phone line right now.
 *
 * Deliberately NOT cached: `globals` is empty, so the runner never snapshots
 * it and a reload cannot paint a call that ended while the tab was closed.
 * A cold load waits on the fetch like every other real surface. Realtime on
 * the calls table (a call starting, each live turn, its end, its analysis)
 * re-runs this apply; the page itself runs the clock and re-applies the
 * heartbeat rule between refreshes.
 */
export const liveOverride: SurfaceOverride = {
  key: "live",
  globals: [],
  events: ["surface:live"],
  // The calls: a transcript turn is a calls UPDATE and nothing else needs to repaint for it; the note a call leaves in the
  // thread is a messages INSERT the default surfaces already follow. The line's number and its switch are the channels read's,
  // which Live follows (above): context, not a precondition, so a line not read yet draws none.
  ...declareReads("live", { reads: ["call"], fresh: "live", when: callTurnHeard }),
  debounceMs: 300,
  apply: async () => {
    const [callsRes, tz] = await Promise.all([read("GET calls"), workspaceZone()]);
    made = { calls: callsRes.calls, tz };
    readAtMs = Date.now();
    setSurfaceValue("live", toLiveVM(callsRes.calls, channelsHeld() ?? null, tz));
  },
};
