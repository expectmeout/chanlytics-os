import { z } from "zod";
import { read, write, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { memberAlerts } from "@/server/readers/notifications";
import { saveMemberPushOff } from "@/server/workspace/alerts";

/**
 * GET /api/v1/me/alerts — what reaches this member's phones in this workspace: the kinds they turned off, their phones,
 * and whether the choice can be saved yet (decision 0040). The body is its reader's (readers/notifications.ts).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), memberAlerts, undefined)).data,
});

const Choice = z.object({ push_off: z.array(z.string()).max(40) });

/**
 * PUT /api/v1/me/alerts — { push_off: [kind, …] }: the kinds this member's phones are not told in this workspace. Their
 * own, so every member may, a viewer too; the definer door writes only the caller's membership row.
 */
export const PUT = write({
  scope: workspace,
  role: "viewer",
  rate: "alert_choice",
  input: Choice,
  handle: async ({ ctx, member, input }) => saveMemberPushOff(ctx, member.tenantId, input),
});
