import { read, workspace } from "@/server/shared/route";
import { ChangesQuerySchema, changesSince } from "@/server/shared/live-feed";

/**
 * GET /api/v1/changes?since=<ISO 8601> — what the workspace's topic told since a moment (decision 0019 step 4; the
 * page-open PRD, L5): `{ notices: [{ table, event, statuses, at }], whole }`. A tab asks as it joins the live feed (since
 * its load began) and as it joins again (since its feed went quiet), and reads what the notices name as if it had heard
 * them live; `whole` false (more than one answer carries, or a moment past a day), and it reads everything again.
 *
 * Any member. A notice is no row: a table, an event, the statuses a statement left and its clock.
 *
 * The handle is changesSince in src/server/shared/live-feed.ts: the route is its declaration (who may, how often), the verb is
 * what it does.
 */
export const GET = read({
  scope: workspace,
  query: ChangesQuerySchema,
  handle: ({ ctx, member, input }) => changesSince(ctx, member, input),
});
