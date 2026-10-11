/**
 * Saved lists, written (app/api/v1/segments): a list kept by hand or a smart list with its rule made; renamed, its
 * people put on and taken off or its rule changed; deleted, or archived when something depends on it (a playbook names
 * it, another list's rule reads it: decision 0009). Each change is the ledger's too (00169), so Activity says who did
 * what to which list. The names and rules are judged by lists.ts in the words the edit route uses; the routes declare
 * who may and how often, and the list is the row (listScope), found under RLS.
 */
import { AppError, ruleNeedsViewer, asListRule, ruleLists } from "@chanlytics/contracts";
import { jsonBody } from "@/server/request-guards";
import {
  createList,
  savedListsFor,
  addToList,
  archiveList,
  deleteList,
  dropFromList,
  listMemberIds,
  playbooksOnList,
  renameList,
  setListRule,
  type Json,
} from "@chanlytics/db";
import { LIST_NAME_TAKEN, cleanListName, cleanListRule, cleanIdList, type SavedListDto } from "@/server/people/lists";
import { recordDecision, type listScope } from "@/server/verbs";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

/** The saved list a listScope route acts on, as the scope read it (RLS: one the caller cannot see is a 404). */
type SavedListRow = Awaited<ReturnType<typeof listScope.load>>;

export async function createSavedList(ctx: RouteContext, req: Request, member: Member) {
  const body = (await jsonBody(req)) as { name?: unknown; rule?: unknown } | null;
  const name = cleanListName(body?.name);
  // A rule may read the workspace's other lists (in_list): they are read to check it can (cleanListRule).
  const rule = cleanListRule(body?.rule, body?.rule != null ? await savedListsFor(ctx.supabase, member.tenantId) : []);
  const { list, error } = await createList(ctx.supabase, member.tenantId, name, ctx.userId, rule);
  if (error || !list) {
    if (error?.code === "23505") throw new AppError("conflict", LIST_NAME_TAKEN, 409);
    throw new Error(error?.message ?? "The list was not made.");
  }
  // The ledger's (00169, decision 0009): Activity says who made which list, kept by hand or by a rule.
  await recordDecision(ctx, member.tenantId, "list", list.id, "make_list", {
    name: list.name,
    kept: rule ? "rule" : "hand",
    ...(rule ? { rule: rule as unknown as Json } : {}),
  });
  const made: SavedListDto = { id: list.id, name: list.name, ids: [], rule, archived_at: null };
  return made;
}

export async function changeSavedList(ctx: RouteContext, req: Request, list: SavedListRow) {
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
      if (error.code === "23505") throw new AppError("conflict", LIST_NAME_TAKEN, 409);
      throw new Error(error.message);
    }
    await recordDecision(ctx, tenantId, "list", id, "rename_list", { from: list.name, to: rename });
  }
  if (rule) {
    // A playbook runs on it with no one looking: a rule about "me" would stop it every day, so it is refused here.
    if (ruleNeedsViewer(rule)) {
      const on = await playbooksOnList(ctx.supabase, tenantId, id);
      if (on.length)
        throw new AppError(
          "conflict",
          `${on.map((p) => p.name).join(", ")} runs on ${list.name}, and a campaign's run has no one looking: a rule about "me" would stop it. Move the campaign first.`,
          409,
        );
    }
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
}

export async function removeSavedList(ctx: RouteContext, list: SavedListRow) {
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
      throw new AppError("conflict", "A campaign was just put on this list. Delete it again to archive it.", 409);
    throw new Error(error.message);
  }
  if (!count) throw new AppError("not_found", "List not found.", 404);
  await recordDecision(ctx, tenantId, "list", id, "delete_list", { name: list.name });
  return { deleted: true, id };
}
