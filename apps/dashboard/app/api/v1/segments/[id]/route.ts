import { AppError } from "@chanlytics/contracts";
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
      const { error } = await ctx.supabase.from("segments").update({ name: rename }).eq("id", id);
      if (error) {
        if (error.code === "23505") throw new AppError("conflict", "A list with that name already exists.", 409);
        throw new Error(error.message);
      }
    }
    if (remove.length) {
      const { error } = await ctx.supabase.from("segment_members").delete().eq("segment_id", id).in("contact_id", remove);
      if (error) throw new Error(error.message);
    }
    if (add.length) {
      const rows = add.map((contact_id) => ({ segment_id: id, contact_id, tenant_id: list.tenant_id, added_by: ctx.userId }));
      const { error } = await ctx.supabase.from("segment_members").upsert(rows, { onConflict: "segment_id,contact_id", ignoreDuplicates: true });
      if (error) {
        // RLS's with-check is the refusal for a person of another workspace or
        // one who was erased; PostgREST reports it as a policy violation.
        if (error.code === "42501") throw new AppError("validation", "One of those people is not in this workspace any more.");
        throw new Error(error.message);
      }
    }

    const { data: members, error: mErr } = await ctx.supabase.from("segment_members").select("contact_id").eq("segment_id", id);
    if (mErr) throw new Error(mErr.message);
    const out: SavedListDto = { id, name: rename ?? list.name, ids: (members ?? []).map((m) => m.contact_id) };
    return out;
  },
});

export const DELETE = write({
  scope: listScope,
  role: "operator",
  rate: "lists",
  handle: async ({ ctx, row: list }) => {
    const id = list.id;
    const { error, count } = await ctx.supabase.from("segments").delete({ count: "exact" }).eq("id", id);
    if (error) throw new Error(error.message);
    if (!count) throw new AppError("not_found", "List not found.", 404);
    return { deleted: true, id };
  },
});
