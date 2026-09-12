import { z } from "zod";
import { read, workspace } from "@/server/route";
import { activityLog } from "@/server/activity";

const Query = z.object({
  person: z.string().uuid().optional(),
  kind: z.string().max(60).regex(/^[a-z_.]+$/).optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  offset: z.coerce.number().int().min(0).max(100_000).optional(),
});

/**
 * GET /api/v1/activity -- what happened in this workspace, and who did it.
 *
 * Both ledgers (decisions and events), newest first, in an owner's words,
 * filtered by ?person= (their rows and their threads' and calls'), ?kind=
 * (a verb or an event kind, exactly) and ?day= (by the workspace's clock),
 * a hundred at a time with ?offset=. Owners: it is the whole record of the
 * workspace, including what every member did. The evidence families are left
 * out unless asked for by name (server/activity.ts).
 */
export const GET = read({
  scope: workspace,
  role: "owner",
  rate: "aggregate",
  query: Query,
  handle: async ({ ctx, member, input }) => activityLog(ctx, member.tenantId, input ?? {}),
});
