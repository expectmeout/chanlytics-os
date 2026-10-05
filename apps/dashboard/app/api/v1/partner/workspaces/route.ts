import { read, write, account } from "@/server/route";
import { HandoverCreateSchema } from "@chanlytics/contracts";
import { readPartnerWorkspaces, setUpWorkspaceForBusiness } from "@/server/workspace/partner-account";

/**
 * GET /api/v1/partner/workspaces — the workspaces the caller brought as a partner (decision 0012, P4): the back
 * office's row for each they still sit on the team of (00204 partner_overview, judged by the page with contracts'
 * platformRows), and the standing and earnings of each they ever brought; and the handover of each they set up for a
 * business (0016). On the account: a partner is a person. The database answers about the caller alone, so a caller
 * who is no partner reads three empty lists.
 *
 * The handle is readPartnerWorkspaces in src/server/workspace/partner-account.ts: the route is its declaration (who
 * may, how often), the verb is what it does.
 */
export const GET = read({
  scope: account,
  handle: ({ ctx }) => readPartnerWorkspaces(ctx),
});

/**
 * POST /api/v1/partner/workspaces — {name, timezone?, email}: the caller, an active partner, sets a workspace up for
 * a business and hands it to its owner (decision 0016, 00214 create_workspace_for_business). They sit on it as its
 * partner, never its owner; the owner is invited, and owns it once they accept. `sent` says whether the invitation
 * went: the workspace is made either way, and the invitation can be sent again.
 *
 * The handle is setUpWorkspaceForBusiness in src/server/workspace/partner-account.ts: the route is its declaration (who
 * may, how often), the verb is what it does.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "partner_handover",
  input: HandoverCreateSchema,
  handle: ({ ctx, input }) => setUpWorkspaceForBusiness(ctx, input),
});
