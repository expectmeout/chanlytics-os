import { write } from "@/server/route";
import { listScope } from "@/server/verbs";
import { changeSavedList, removeSavedList } from "@/server/people/list-write";

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
 *
 * The handles are changeSavedList and removeSavedList in src/server/people/list-write.ts: each route is its declaration
 * (who may, how often), each verb is what it does.
 */
export const PUT = write({
  scope: listScope,
  role: "operator",
  rate: "lists",
  handle: ({ ctx, req, row }) => changeSavedList(ctx, req, row),
});

export const DELETE = write({
  scope: listScope,
  role: "operator",
  rate: "lists",
  handle: ({ ctx, row }) => removeSavedList(ctx, row),
});
