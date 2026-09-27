import "server-only";
import { savedListsFor } from "@chanlytics/db";
import type { SavedListDto } from "../people/lists";
import { stamp, type Reader } from "./index";

/**
 * GET segments, as the route answers it: every list of the one workspace read, each with every member's id (packages/db
 * savedListsFor pages the memberships past PostgREST's thousand) and its rule when it keeps itself current. Scoped by
 * the workspace, not by RLS alone. A list is not a row a citation names until Phase 4 gives it a kind.
 */
export const lists: Reader<undefined, { lists: SavedListDto[] }> = {
  name: "lists",
  async read(rc) {
    return { data: { lists: await savedListsFor(rc.ctx.supabase, rc.tenantId) }, rows: [], stamp: stamp() };
  },
};
