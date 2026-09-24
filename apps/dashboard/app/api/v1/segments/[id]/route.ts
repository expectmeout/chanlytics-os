import { AppError } from "@chanlytics/contracts";
import {
  addToList,
  archiveList,
  deleteList,
  dropFromList,
  listMemberIds,
  playbooksOnList,
  renameList,
  savedListsFor,
  setListRule,
  type Json,
} from "@chanlytics/db";
import { asListRule, ruleLists } from "@chanlytics/contracts";
import { write } from "@/server/route";
import { listScope, recordDecision } from "@/server/verbs";
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
 *        stay; only the grouping goes. A list something depends on -- a
 *        playbook names it, another list's rule reads it -- is archived
 *        instead: off People's rail, still resolving, its playbooks paused
 *        (decision 0009). PUT { archived: false } brings it back.
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
    const body = (await jsonBody(req)) as {
      name?: unknown;
      add?: unknown;
      remove?: unknown;
      rule?: unknown;
      archived?: unknown;
    } | null;
    const add = cleanIdList(body?.add, "add");
    const remove = cleanIdList(body?.remove, "remove");
    const rename = body?.name !== undefined ? cleanListName(body.name) : null;
    // Restored: an archived list back on People's rail (00169). Archiving is DELETE's, when something depends on it.
    const restore = body?.archived === false && !!list.archived_at;
    const rule = cleanListRule(
      body?.rule,
      body?.rule != null ? await savedListsFor(ctx.supabase, list.tenant_id) : [],
      list.id,
    );
    if (!rename && !add.length && !remove.length && !rule && !restore)
      throw new AppError("validation", "Nothing to change.");
    const smart = list.rule != null;
    if (smart && (add.length || remove.length))
      throw new AppError("validation", "Nobody is put on a smart list by hand: its rule says who is on it.");
    if (!smart && rule) throw new AppError("validation", "A list kept by hand has no rule. Make a smart list instead.");

    // Each change is the ledger's too (00169): Activity says who renamed which list, changed who is on it, or put
    // people on it and took them off.
    const tenantId = list.tenant_id;
    // Restored first, with its new name in the same write: a restore refused leaves nothing half done.
    if (restore) {
      const renamed = rename && rename !== list.name ? rename : undefined;
      const { error, count } = await archiveList(ctx.supabase, id, null, renamed);
      if (error) {
        if (error.code === "23505")
          throw new AppError(
            "conflict",
            "A list with that name is on People now. Rename this one to bring it back.",
            409,
          );
        throw new Error(error.message);
      }
      if (!count) throw new AppError("not_found", "List not found.", 404);
      if (renamed) await recordDecision(ctx, tenantId, "list", id, "rename_list", { from: list.name, to: renamed });
      await recordDecision(ctx, tenantId, "list", id, "restore_list", { name: rename ?? list.name });
    }
    if (rename && rename !== list.name && !restore) {
      const { error } = await renameList(ctx.supabase, id, rename);
      if (error) {
        if (error.code === "23505") throw new AppError("conflict", "A list with that name already exists.", 409);
        throw new Error(error.message);
      }
      await recordDecision(ctx, tenantId, "list", id, "rename_list", { from: list.name, to: rename });
    }
    if (rule) {
      const { error } = await setListRule(ctx.supabase, id, rule);
      if (error) throw new Error(error.message);
      await recordDecision(ctx, tenantId, "list", id, "change_list_rule", {
        name: rename ?? list.name,
        rule: rule as unknown as Json,
      });
    }
    if (remove.length) {
      const { error } = await dropFromList(ctx.supabase, id, remove);
      if (error) throw new Error(error.message);
      await recordDecision(ctx, tenantId, "list", id, "drop_from_list", {
        name: rename ?? list.name,
        count: remove.length,
      });
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
      await recordDecision(ctx, tenantId, "list", id, "add_to_list", { name: rename ?? list.name, count: add.length });
    }

    // Every id, not the first thousand: an Undo tells who an add really added from this answer.
    const archived_at = restore ? null : list.archived_at;
    const out: SavedListDto = smart
      ? { id, name: rename ?? list.name, ids: [], rule: rule ?? list.rule, archived_at }
      : { id, name: rename ?? list.name, ids: await listMemberIds(ctx.supabase, id), rule: null, archived_at };
    return out;
  },
});

export const DELETE = write({
  scope: listScope,
  role: "operator",
  rate: "lists",
  handle: async ({ ctx, row: list }) => {
    const id = list.id;
    const tenantId = list.tenant_id;
    // What depends on it (decision 0009): the playbooks that name it, and the workspace's lists whose rule reads it.
    const [playbooks, lists] = await Promise.all([
      playbooksOnList(ctx.supabase, tenantId, id),
      savedListsFor(ctx.supabase, tenantId),
    ]);
    const token = `list:${id.toLowerCase()}`;
    const readBy = lists.filter((l) => {
      if (l.id === id || l.rule == null) return false;
      const r = asListRule(l.rule);
      return !!r && ruleLists(r).some((t) => t.toLowerCase() === token);
    });
    if (playbooks.length || readBy.length) {
      // Archived, not deleted: it leaves People's rail and still resolves, and the playbooks on it pause until their
      // owner restores it or moves them. What is paused and what reads it are said back, for the page to say.
      const paused = playbooks.filter((p) => p.state === "running");
      if (!list.archived_at) {
        const { error, count } = await archiveList(ctx.supabase, id, new Date());
        if (error) throw new Error(error.message);
        if (!count) throw new AppError("not_found", "List not found.", 404);
      }
      for (const p of paused) {
        const { error } = await ctx.supabase.from("playbooks").update({ state: "paused" }).eq("id", p.id);
        if (error) throw new Error(error.message);
        await recordDecision(ctx, tenantId, "playbook", p.id, "pause_playbook", { name: p.name, why: "list_archived" });
      }
      await recordDecision(ctx, tenantId, "list", id, "archive_list", {
        name: list.name,
        paused: paused.map((p) => p.name),
        on_it: playbooks.map((p) => p.name),
        read_by: readBy.map((l) => l.name),
      });
      return {
        archived: true,
        id,
        paused: paused.map((p) => p.name),
        on_it: playbooks.map((p) => p.name),
        read_by: readBy.map((l) => l.name),
      };
    }
    const { error, count } = await deleteList(ctx.supabase, id);
    if (error) {
      // A playbook put on it between the read above and this delete: 00169's reference refuses the delete.
      if (error.code === "23503")
        throw new AppError("conflict", "A playbook was just put on this list. Delete it again to archive it.", 409);
      throw new Error(error.message);
    }
    if (!count) throw new AppError("not_found", "List not found.", 404);
    await recordDecision(ctx, tenantId, "list", id, "delete_list", { name: list.name });
    return { deleted: true, id };
  },
});
