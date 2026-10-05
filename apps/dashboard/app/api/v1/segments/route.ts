import { read, write, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { lists } from "@/server/readers/lists";
import { createSavedList } from "@/server/people/list-write";

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
 * a member of two workspaces must see one workspace's lists at a time. The
 * GET's body is its reader's (readers/lists.ts), which Ask reads too.
 *
 * The handle is createSavedList in src/server/people/list-write.ts: the route is its declaration (who may, how often),
 * the verb is what it does.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), lists, undefined)).data,
});

/**
 * { name, rule? }: a list kept by hand, or a smart list with its rule (00155). The name is refused by cleanListName in
 * the words the edit route uses too, and a rule the vocabulary cannot read by cleanListRule.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "lists",
  handle: ({ ctx, req, member }) => createSavedList(ctx, req, member),
});
