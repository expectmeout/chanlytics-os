import { z } from "zod";
import { read, workspace } from "@/server/route";
import { activityLog } from "@/server/activity";

const Query = z.object({
  person: z.string().uuid().optional(),
  kind: z.string().max(60).regex(/^[a-z_.]+$/).optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // "<created_at>|<row id>", as a page hands back in next_cursor: an ISO
  // instant, a bar, then `d-` or `e-` and the ledger row's own id.
  cursor: z.string().max(120).regex(/^[\d-]{10}T[\d:.]+(?:Z|[+-][\d:]+)\|[de]-[\w-]+$/).optional(),
});

/**
 * GET /api/v1/activity -- what happened in this workspace, and who did it.
 *
 * Both ledgers (decisions and events), newest first, in an owner's words,
 * filtered by ?person= (their rows and their threads' and calls'), ?kind=
 * (a verb or an event kind, exactly) and ?day= (by the workspace's clock),
 * a hundred at a time with ?cursor= (the page before hands one back). Owners:
 * it is the whole record of the workspace, including what every member did.
 * The evidence families are left out unless asked for by name
 * (server/activity.ts).
 */
export const GET = read({
  scope: workspace,
  role: "owner",
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => activityLog(ctx, member.tenantId, input ?? {}),
});
