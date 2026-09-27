import "server-only";
import { leadsRoute } from "@chanlytics/contracts";
import { searchesOf } from "../leads/lead-searches";
import { stamp, type Reader } from "./index";

/**
 * GET lead-searches, as the route answers it: every kept search with its
 * latest round, and the rail's six counts, read together. Each search is a
 * row a citation names, opened on Leads at that search.
 */
export const searches: Reader<undefined, Awaited<ReturnType<typeof searchesOf>>> = {
  name: "searches",
  async read(rc) {
    const data = await searchesOf(rc.ctx, rc.tenantId);
    return {
      data,
      rows: data.searches.map((s) => ({
        kind: "search" as const,
        id: s.id,
        route: leadsRoute({ searchId: s.id }),
        label: s.name,
      })),
      stamp: stamp(),
    };
  },
};
