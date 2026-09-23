import { AppError } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/route";
import { jsonBody } from "@/server/request-guards";
import { createList, savedListsFor } from "@chanlytics/db";
import { cleanListName, type SavedListDto } from "@/server/lists";

/**
 * Saved lists: a name and the people on it.
 *
 * GET  /api/v1/segments — every list of ONE workspace with its members' ids.
 *      The ids, not counts: People already holds every row, so the page
 *      filters and counts client-side the way it does for the computed lists,
 *      and an erased person (gone from the rows) never counts. Every id, not
 *      the first thousand memberships (lists.ts savedLists).
 * POST /api/v1/segments — { name } makes an empty list. Owner or operator.
 *
 * Scoped explicitly by tenant, not by RLS alone (the templates route's rule):
 * a member of two workspaces must see one workspace's lists at a time.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => ({ lists: await savedListsFor(ctx.supabase, member.tenantId) }),
});

/** The name is the only thing a person types, and cleanListName refuses it in the words the edit route uses too. */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "lists",
  handle: async ({ ctx, req, member }) => {
    const body = (await jsonBody(req)) as { name?: unknown } | null;
    const name = cleanListName(body?.name);
    const { list, error } = await createList(ctx.supabase, member.tenantId, name, ctx.userId);
    if (error || !list) {
      if (error?.code === "23505") throw new AppError("conflict", "A list with that name already exists.", 409);
      throw new Error(error?.message ?? "The list was not made.");
    }
    const made: SavedListDto = { id: list.id, name: list.name, ids: [] };
    return made;
  },
});
