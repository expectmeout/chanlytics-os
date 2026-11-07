import "server-only";
import { leadsRoute } from "@chanlytics/contracts";
import { searchRow, getSearches } from "../leads/searches";
import { readerStamp, type Reader } from "../shared/reader";

/**
 * GET lead-searches, as the route answers it: every kept search with its
 * latest round, and the rail's six counts, read together. Each search is a
 * row a citation names, opened on Leads at that search.
 */
export const searches: Reader<undefined, Awaited<ReturnType<typeof getSearches>>> = {
  name: "searches",
  async read(rc) {
    const data = await getSearches(rc.ctx, rc.tenantId);
    return {
      data,
      rows: data.searches.map((s) => ({
        kind: "search" as const,
        id: s.id,
        route: leadsRoute({ searchId: s.id }),
        label: s.name,
      })),
      stamp: readerStamp(),
    };
  },
};

/**
 * GET lead-searches/:id, as the route answers it: one search of the workspace with its latest round, as
 * lead_searches_view says it (server/leads/searches.ts searchRow), removed from the rail or not; one this
 * workspace does not hold is the route's 404. The search is the row a citation names, opened on Leads at that search.
 */
export const search: Reader<{ id: string }, { search: Awaited<ReturnType<typeof searchRow>> }> = {
  name: "search",
  async read(rc, { id }) {
    const row = await searchRow(rc.ctx, rc.tenantId, id);
    return {
      data: { search: row },
      rows: [{ kind: "search", id: row.id, route: leadsRoute({ searchId: row.id }), label: row.name }],
      stamp: readerStamp(),
    };
  },
};
