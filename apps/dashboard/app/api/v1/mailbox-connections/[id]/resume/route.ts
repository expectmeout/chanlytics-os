import { write, workspace } from "@/server/route";
import { resumeMailbox } from "@/server/connections/mailbox-connections";

/**
 * POST /api/v1/mailbox-connections/:id/resume
 *
 * The owner's Resume, for a mailbox its own mail held (a complaint, or bounces or noes past 3%): it sends again, its
 * count starts again, and its ramp stays where it was.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: async ({ ctx, member }) => ({
    mailbox: await resumeMailbox(member.tenantId, ctx.userId, String(ctx.params.id ?? "")),
  }),
});
