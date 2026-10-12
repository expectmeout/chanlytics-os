/**
 * Live's override: the phone line right now. Part of the SurfaceData seam
 * (../surface-data.ts).
 */

import { read } from "@/legacy-bridge/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import { toLiveVM, type LiveVM } from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { declareSurfaceValue, setSurfaceValue } from "../surface-values";

/** The phone line right now: the calls in progress and the ones that just ended, with the line's number and switch. */
export type LiveSurface = LiveVM;

// The frame (its top bar, its tab strip and the first run) and Ask read this under its old name until they move.
declareSurfaceValue("live", "__LIVE");

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
  // The calls, and the line's own row: a transcript turn is a calls UPDATE and nothing else needs to repaint for it; the
  // note a call leaves in the thread is a messages INSERT the default surfaces already follow. The number and its on/off
  // switch come from tenant_channels, which Setup hears: a line connected or switched off elsewhere is heard here too.
  ...declareReads("live", {
    reads: ["call", "channel"],
    fresh: "live",
    omit: [
      {
        tables: ["lines", "mailboxes", "sending_domains", "capability_activations", "business_records"],
        why: "it draws the line's number and its switch (tenant_channels); a line's saga, a mailbox, a domain, an activation and the carriers' record are not among them",
      },
    ],
  }),
  debounceMs: 300,
  apply: async () => {
    const [callsRes, chRes, tz] = await Promise.all([
      read("GET calls"),
      // The line's number and switch are context, not a precondition.
      read("GET channels").catch((e: unknown) => e as Error),
      workspaceZone(),
    ]);
    if (chRes instanceof Error) console.error("live_channels_fetch_failed", chRes.message);
    setSurfaceValue("live", toLiveVM(callsRes.calls, chRes instanceof Error ? null : chRes.channels, tz));
  },
};
