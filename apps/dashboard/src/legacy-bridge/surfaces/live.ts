/**
 * Live's override: the phone line right now. Part of the SurfaceData seam
 * (../surface-data.ts).
 */

import { read } from "../api";
import { workspaceZone } from "../zone";
import { toLiveVM, type LiveVM } from "@chanlytics/contracts";
import type { SurfaceOverride } from "../surface-data";

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
  // Calls only: a transcript turn is a calls UPDATE and nothing else needs
  // to repaint for it; the note a call leaves in the thread is a messages
  // INSERT the default surfaces already follow.
  refreshOnTables: ["calls"],
  debounceMs: 300,
  apply: async () => {
    const [callsRes, chRes, tz] = await Promise.all([
      read("GET calls"),
      // The line's number and switch are context, not a precondition.
      read("GET channels").catch((e: unknown) => e as Error),
      workspaceZone(),
    ]);
    if (chRes instanceof Error) console.error("live_channels_fetch_failed", chRes.message);
    (window as unknown as { __LIVE?: LiveVM }).__LIVE = toLiveVM(
      callsRes.calls,
      chRes instanceof Error ? null : chRes.channels,
      tz,
    );
  },
};
