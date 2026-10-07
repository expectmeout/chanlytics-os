/**
 * The bell's override: the month's kept notifications and this person's seen
 * moment. Part of the SurfaceData seam (../surface-data.ts).
 */

import { read } from "../api";
import type { NotificationsDto } from "@chanlytics/contracts";
import type { SurfaceOverride } from "../surface-data";

/* ---------------------------- Notifications ------------------------------ */

export interface NotificationsSurface {
  dto: NotificationsDto;
  fetchedAt: number;
}

/**
 * Notifications: the month's kept rows and this person's seen moment. The
 * bell reads them beside what it derives from the surfaces around it, and
 * repaints as the edge writes a row.
 */
export const notificationsOverride: SurfaceOverride = {
  key: "notifications",
  globals: ["__NOTIFICATIONS"],
  events: ["surface:notifications"],
  refreshOnTables: ["notifications"],
  apply: async () => {
    const dto = await read("GET notifications");
    (window as unknown as { __NOTIFICATIONS?: NotificationsSurface }).__NOTIFICATIONS = { dto, fetchedAt: Date.now() };
  },
};
