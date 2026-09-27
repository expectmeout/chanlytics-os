import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { activity } from "@/server/readers/activity";
import { ActivityQuerySchema } from "@/server/metrics/activity";

/**
 * GET /api/v1/activity -- what happened in this workspace, and who did it.
 *
 * Both ledgers (decisions and events), newest first, in an owner's words,
 * filtered by ?person= (their rows and their threads' and calls'), ?kind=
 * (a verb or an event kind, exactly) and ?day= (by the workspace's clock),
 * a hundred at a time with ?cursor= (the page before hands one back). Owners:
 * it is the whole record of the workspace, including what every member did.
 * The evidence families are left out unless asked for by name
 * (server/metrics/activity.ts). The body is its reader's (readers/activity.ts), which
 * trusts this door: the owner's role and the query's checks (ActivityQuerySchema,
 * which Ask's workspace.activity checks too) stay here.
 */
export const GET = read({
  scope: workspace,
  role: "owner",
  rate: "aggregate",
  query: ActivityQuerySchema,
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), activity, input ?? {})).data,
});
