import { write, workspace } from "@/server/route";
import { sendAlertTest } from "@/server/workspace/alerts";

/**
 * POST /api/v1/notifications/test — {}: one email to every address the workspace's alerts go to, so an owner knows each
 * arrives (decision 0040). Whoever may change the addresses may test them (the owner and the partner, as PUT settings),
 * three times an hour. Answers { sent, to, why }.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "alert_test",
  handle: async ({ ctx, member }) => sendAlertTest(member.tenantId, ctx.userId),
});
