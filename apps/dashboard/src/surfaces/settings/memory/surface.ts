/**
 * What Ask remembers about the business and its journal's newest days, for Settings › Memory (decision 0070): `GET
 * ask/memory`, read only where the pane is drawn (ROUTE_DRAWS names it for `admin/memory`), as the alerts are for
 * Notifications. The verbs are verbs.ts's, which only the pane loads: this module rides the route every page loads, so it
 * holds the read alone.
 *
 * The value is the seam's (`useSurface("ask_memory")`): undefined until read, null when the read failed.
 */
import type { AskMemoryPageDto } from "@chanlytics/contracts";
import { ON_DEMAND_STALE_MIN, readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { read } from "@/legacy-bridge/api";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { setSurfaceValue, surfaceValue } from "../../surface-values";

export interface AskMemorySurface {
  dto: AskMemoryPageDto;
  fetchedAt: number;
}

export const askMemoryOverride: SurfaceOverride = {
  key: "ask_memory",
  value: "ask_memory",
  onDemand: true,
  isStale: () => readAged(surfaceValue("ask_memory")?.fetchedAt),
  events: ["surface:ask_memory"],
  // Ask's own memory, which the feed does not carry (it is no record kind): read where the pane is drawn, again when what
  // it holds has aged, and after the pane's verbs and a card Ask kept (the refresh map).
  ...declareReads("ask_memory", { reads: [], fresh: { aged: ON_DEMAND_STALE_MIN } }),
  apply: async () => {
    try {
      const d = await read("GET ask/memory");
      setSurfaceValue("ask_memory", { dto: d, fetchedAt: Date.now() });
    } catch (e) {
      setSurfaceValue("ask_memory", null);
      throw e;
    }
  },
};
