import { AppError } from "@chanlytics/contracts";
import { addToList, deleteList, dropFromList, listMemberIds, renameList, setListRule } from "@chanlytics/db";
import { write } from "@/server/route";
import { listScope } from "@/server/verbs";
import { jsonBody } from "@/server/request-guards";
import { cleanIdList, cleanListName, cleanListRule, type SavedListDto } from "@/server/lists";

/**
 * One saved list.
 *
 * PUT    /api/v1/segments/:id — { name?, add?: ids, remove?: ids, rule? }.
 *        Rename, put people on, take people off — any mix, in one request —
 *        or change a smart list's rule. Adding someone twice is not an error;
 *        RLS refuses a person of another workspace or one who was erased.
 *        Nobody is put on or taken off a smart list by hand: its rule says
 *        who is on it. Answers the list as it now is.
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
    const body = (await jsonBody(req)) as { name?: unknown; add?: unknown; remove?: unknown; rule?: unknown } | null;
    const add = cleanIdList(body?.add, "add");
    const remove = cleanIdList(body?.remove, "remove");
    const rename = body?.name !== undefined ? cleanListName(body.name) : null;
    const rule = cleanListRule(body?.rule);
    if (!rename && !add.length && !remove.length && !rule) throw new AppError("validation", "Nothing to change.");
    const smart = list.rule != null;
    if (smart && (add.length || remove.length))
      throw new AppError("validation", "Nobody is put on a smart list by hand: its rule says who is on it.");
    if (!smart && rule) throw new AppError("validation", "A list kept by hand has no rule. Make a smart list instead.");

    if (rename && rename !== list.name) {
      const { error } = await renameList(ctx.supabase, id, rename);
      if (error) {
        if (error.code === "23505") throw new AppError("conflict", "A list with that name already exists.", 409);
        throw new Error(error.message);
      }
    }
    if (rule) {
      const { error } = await setListRule(ctx.supabase, id, rule);
      if (error) throw new Error(error.message);
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
    const out: SavedListDto = smart
      ? { id, name: rename ?? list.name, ids: [], rule: rule ?? list.rule }
      : { id, name: rename ?? list.name, ids: await listMemberIds(ctx.supabase, id), rule: null };
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
