import { AppError } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/route";
import { jsonBody } from "@/server/request-guards";
import { createList, savedListsFor, type Json } from "@chanlytics/db";
import { cleanListName, cleanListRule, type SavedListDto } from "@/server/lists";
import { recordDecision } from "@/server/verbs";

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

/**
 * { name, rule? }: a list kept by hand, or a smart list with its rule (00155). The name is refused by cleanListName in
 * the words the edit route uses too, and a rule the vocabulary cannot read by cleanListRule.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "lists",
  handle: async ({ ctx, req, member }) => {
    const body = (await jsonBody(req)) as { name?: unknown; rule?: unknown } | null;
    const name = cleanListName(body?.name);
    // A rule may read the workspace's other lists (in_list): they are read to check it can (cleanListRule).
    const rule = cleanListRule(
      body?.rule,
      body?.rule != null ? await savedListsFor(ctx.supabase, member.tenantId) : [],
    );
    const { list, error } = await createList(ctx.supabase, member.tenantId, name, ctx.userId, rule);
    if (error || !list) {
      if (error?.code === "23505") throw new AppError("conflict", "A list with that name already exists.", 409);
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
  },
});
