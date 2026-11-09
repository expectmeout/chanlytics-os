import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { recordProviderWanted } from "@/server/campaigns/reach-outs/mailbox-needed";

const Body = z.strictObject({
  provider: z.string().trim().min(1, "Say which you use.").max(60, "Keep it under 60 characters."),
});

/**
 * POST /api/v1/settings/reach-out/provider-wanted: which mailbox a workspace that can't connect would use. Only Google
 * Workspace connects today, and this keeps who asks for something else (Cold email's "Tell us"), so Microsoft is built when
 * the asks justify the work and they can be told when it is.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    await recordProviderWanted(member.tenantId, ctx.userId, input.provider);
    return { told: true };
  },
});
