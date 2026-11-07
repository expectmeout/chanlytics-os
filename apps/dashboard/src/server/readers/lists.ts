import "server-only";
import { addressOf } from "@chanlytics/contracts";
import { listSavedLists } from "@chanlytics/db/people";
import type { SavedListDto } from "../people/lists";
import { readerStamp, type Reader } from "../shared/reader";

/**
 * GET segments, as the route answers it: every list of the one workspace read, each with every member's id (packages/db
 * listSavedLists pages the memberships past PostgREST's thousand) and its rule when it keeps itself current. Scoped by
 * the workspace, not by RLS alone. Each list is a row a citation names, opened on People at that list.
 */
export const lists: Reader<undefined, { lists: SavedListDto[] }> = {
  name: "lists",
  async read(rc) {
    const saved = await listSavedLists(rc.ctx.supabase, rc.tenantId);
    return {
      data: { lists: saved },
      rows: saved.map((l) => ({
        kind: "list" as const,
        id: l.id,
        route: addressOf({ kind: "list", id: l.id, saved: true }),
        label: l.name,
      })),
      stamp: readerStamp(),
    };
  },
};
