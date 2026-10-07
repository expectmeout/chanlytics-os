import { write, account } from "@/server/route";
import { HandoverResendSchema } from "@chanlytics/contracts";
import { resendWorkspaceHandover } from "@/server/workspace/partner-account";

/**
 * POST /api/v1/partner/workspaces/:id/resend — {email}: the caller sends the handover of a workspace they set up
 * again (decision 0016, 00214 partner_handover_resend), to the same address or another, open fourteen more days.
 * Refused once the workspace has its owner. `sent` says whether the invitation went.
 *
 * The handle is resendWorkspaceHandover in src/server/workspace/partner-account.ts: the route is its declaration (who
 * may, how often), the verb is what it does.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "partner_handover",
  input: HandoverResendSchema,
  handle: ({ ctx, input }) => resendWorkspaceHandover(ctx, input),
});
