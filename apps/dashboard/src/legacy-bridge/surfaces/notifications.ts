/**
 * The bell's override: the month's kept notifications and this person's seen
 * moment. Part of the SurfaceData seam (../surface-data.ts).
 */

import { read } from "../api";
import type { NotificationsDto } from "@chanlytics/contracts";
import type { SurfaceOverride } from "../surface-data";
import { declareReads } from "../surface-registry";
import { readWhatTheyAreAbout } from "./notice-re-reads";

/* ---------------------------- Notifications ------------------------------ */

export interface NotificationsSurface {
  dto: NotificationsDto;
  fetchedAt: number;
}

/**
 * The rows this tab has read, by id, so the next read can tell the ones it has not seen. Null until the first read: those rows are a
 * backlog (as the bell's own device alerts treat them), not news. A row dismissed or put back is still a row seen.
 */
let known: Set<string> | null = null;

/**
 * Notifications: the month's kept rows and this person's seen moment. The
 * bell reads them beside what it derives from the surfaces around it, and
 * repaints as the edge writes a row. A row it has not seen before, of a kind
 * that is about a table the live feed does not tell a workspace of, also
 * reads the surfaces it is about (notice-re-reads.ts).
 */
export const notificationsOverride: SurfaceOverride = {
  key: "notifications",
  globals: ["__NOTIFICATIONS"],
  events: ["surface:notifications"],
  ...declareReads("notifications", { reads: ["notification"], fresh: "live" }),
  apply: async () => {
    const dto = await read("GET notifications");
    (window as unknown as { __NOTIFICATIONS?: NotificationsSurface }).__NOTIFICATIONS = { dto, fetchedAt: Date.now() };
    const before = known;
    known = new Set(dto.notifications.map((n) => n.id));
    if (before) readWhatTheyAreAbout(dto.notifications.filter((n) => !before.has(n.id)));
  },
};
