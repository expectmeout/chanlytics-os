import "server-only";
import { listToken } from "@chanlytics/contracts";
import { savedListsFor } from "@chanlytics/db";
import type { SavedListDto } from "../people/lists";
import { stamp, type Reader } from "./index";

/**
 * GET segments, as the route answers it: every list of the one workspace read, each with every member's id (packages/db
 * savedListsFor pages the memberships past PostgREST's thousand) and its rule when it keeps itself current. Scoped by
 * the workspace, not by RLS alone. Each list is a row a citation names, opened on People at that list.
 */
export const lists: Reader<undefined, { lists: SavedListDto[] }> = {
  name: "lists",
  async read(rc) {
    const saved = await savedListsFor(rc.ctx.supabase, rc.tenantId);
    return {
      data: { lists: saved },
      rows: saved.map((l) => ({
        kind: "list" as const,
        id: l.id,
        route: `clients/${listToken({ kind: "saved", id: l.id })}`,
        label: l.name,
      })),
      stamp: stamp(),
    };
  },
};
