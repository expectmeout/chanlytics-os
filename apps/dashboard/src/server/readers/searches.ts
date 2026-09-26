import "server-only";
import { searchesOf } from "../lead-searches";
import { stamp, type Reader } from "./index";

/**
 * GET lead-searches, as the route answers it: every kept search with its
 * latest round, and the rail's six counts, read together. A search is not a
 * row a citation names until Phase 4.
 */
export const searches: Reader<undefined, Awaited<ReturnType<typeof searchesOf>>> = {
  name: "searches",
  async read(rc) {
    return { data: await searchesOf(rc.ctx, rc.tenantId), rows: [], stamp: stamp() };
  },
};
