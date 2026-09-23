import { AppError } from "@chanlytics/contracts";
import { addToList, deleteList, dropFromList, listMemberIds, renameList } from "@chanlytics/db";
import { write } from "@/server/route";
import { listScope } from "@/server/verbs";
import { jsonBody } from "@/server/request-guards";
import { cleanIdList, cleanListName, type SavedListDto } from "@/server/lists";

/**
 * One saved list.
 *
 * PUT    /api/v1/segments/:id — { name?, add?: ids, remove?: ids }. Rename,
 *        put people on, take people off — any mix, in one request. Adding
 *        someone twice is not an error; RLS refuses a person of another
 *        workspace or one who was erased. Answers the list as it now is.
 * DELETE /api/v1/segments/:id — the list and its member rows. The people
 *        stay; only the grouping goes.
 *
 * Owner or operator. The list is the row (listScope): found under RLS, so
 * one the caller cannot see is a 404, and the role is judged against the
 * list's own workspace.
 */
export const PUT = write({
  scope: listScope,
  role: "operator",
  rate: "lists",
  handle: async ({ ctx, req, row: list }) => {
    const id = list.id;
    const body = (await jsonBody(req)) as { name?: unknown; add?: unknown; remove?: unknown } | null;
    const add = cleanIdList(body?.add, "add");
    const remove = cleanIdList(body?.remove, "remove");
    const rename = body?.name !== undefined ? cleanListName(body.name) : null;
    if (!rename && !add.length && !remove.length) throw new AppError("validation", "Nothing to change.");

    if (rename && rename !== list.name) {
      const { error } = await renameList(ctx.supabase, id, rename);
      if (error) {
        if (error.code === "23505") throw new AppError("conflict", "A list with that name already exists.", 409);
        throw new Error(error.message);
      }
    }
    if (remove.length) {
      const { error } = await dropFromList(ctx.supabase, id, remove);
      if (error) throw new Error(error.message);
    }
    if (add.length) {
      const { error } = await addToList(ctx.supabase, list, add, ctx.userId);
      if (error) {
        // RLS's with-check is the refusal for a person of another workspace or
        // one who was erased; PostgREST reports it as a policy violation.
        if (error.code === "42501")
          throw new AppError("validation", "One of those people is not in this workspace any more.");
        throw new Error(error.message);
      }
    }

    // Every id, not the first thousand: an Undo tells who an add really added from this answer.
    const out: SavedListDto = { id, name: rename ?? list.name, ids: await listMemberIds(ctx.supabase, id) };
    return out;
  },
});

export const DELETE = write({
  scope: listScope,
  role: "operator",
  rate: "lists",
  handle: async ({ ctx, row: list }) => {
    const id = list.id;
    const { error, count } = await deleteList(ctx.supabase, id);
    if (error) throw new Error(error.message);
    if (!count) throw new AppError("not_found", "List not found.", 404);
    return { deleted: true, id };
  },
});
