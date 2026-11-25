/**
 * The bell's override: the month's kept notifications and this person's seen
 * moment, held with the bridge's reads (../held-reads.ts). Part of the SurfaceData seam (../surface-data.ts).
 */

import { read } from "../api";
import type { SurfaceOverride } from "../surface-data";
import { declareReads } from "../surface-registry";
import { holdRead } from "../held-reads";

/* ---------------------------- Notifications ------------------------------ */

/**
 * Notifications: the month's kept rows and this person's seen moment. The
 * bell reads them beside what it derives from the surfaces around it, and
 * repaints as the edge writes a row. A row reads nothing else: what each kind
 * announces is a record the page it opens hears on the feed (decision 0058;
 * the wiring's second audit, S10-8: a row used to read again what the feed
 * had already read).
 */
export const notificationsOverride: SurfaceOverride = {
  key: "notifications",
  events: ["surface:notifications"],
  ...declareReads("notifications", { reads: ["notification"], fresh: "live" }),
  apply: async () => {
    const dto = await read("GET notifications");
    holdRead("notifications", { dto, fetchedAt: Date.now() });
  },
};
