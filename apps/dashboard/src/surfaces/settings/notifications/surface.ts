/**
 * What reaches this member's phones, for Settings › Notifications (decision 0040): their choices in this workspace and
 * their phones (`GET me/alerts`), read only where the pane is drawn (ROUTE_DRAWS names it for `admin/notifications`),
 * as Google's read is for Connections. The verbs are verbs.ts's, which only the pane loads: this module rides the route
 * every page loads, so it holds the read alone.
 *
 * The value is the seam's (`useSurface("alerts")`): undefined until read, null when the read failed, so the pane draws
 * what it can without it (the email and the browser) and offers no phone tick.
 */
import type { MemberAlertsDto } from "@chanlytics/contracts";
import { readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { read } from "@/legacy-bridge/api";
import { setSurfaceValue, surfaceValue } from "../../surface-values";

export interface AlertsSurface {
  dto: MemberAlertsDto;
  fetchedAt: number;
}

export const alertsOverride: SurfaceOverride = {
  key: "alerts",
  value: "alerts",
  onDemand: true,
  isStale: () => readAged(surfaceValue("alerts")?.fetchedAt),
  events: ["surface:alerts"],
  apply: async () => {
    try {
      const d = await read("GET me/alerts");
      setSurfaceValue("alerts", { dto: d, fetchedAt: Date.now() });
    } catch (e) {
      setSurfaceValue("alerts", null);
      throw e;
    }
  },
};
