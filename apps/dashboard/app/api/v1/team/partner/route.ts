import { read, write, workspace } from "@/server/route";
import { PartnerInviteSchema } from "@chanlytics/contracts";
import {
  readWorkspacePartner,
  inviteWorkspacePartner,
  withdrawWorkspacePartnerInvite,
} from "@/server/workspace/team-partner";

/**
 * The workspace's partner, as its owner manages it (decision 0020, 00225). Owner-only, as the rest of the team is:
 * a partner changes the receptionist of the business, so bringing one in is the owner's call.
 */

/**
 * GET /api/v1/team/partner — who the partner is, and the invitation waiting.
 *
 * The handle is readWorkspacePartner in src/server/workspace/team-partner.ts: the route is its declaration (who may,
 * how often), the verb is what it does.
 */
export const GET = read({
  scope: workspace,
  role: "owner",
  handle: ({ ctx, member }) => readWorkspacePartner(ctx, member),
});

/**
 * POST /api/v1/team/partner — {code}: ask the partner with this code (or whose link this is) to join, for fourteen
 * days. The partner is told by email; `sent` says whether it went, and the invitation stands either way.
 *
 * The handle is inviteWorkspacePartner in src/server/workspace/team-partner.ts: the route is its declaration (who may,
 * how often), the verb is what it does.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "partner_invite",
  fresh: true,
  input: PartnerInviteSchema,
  handle: ({ ctx, member, input }) => inviteWorkspacePartner(ctx, member, input),
});

/**
 * DELETE /api/v1/team/partner — take the invitation back before it is answered.
 *
 * The handle is withdrawWorkspacePartnerInvite in src/server/workspace/team-partner.ts: the route is its declaration
 * (who may, how often), the verb is what it does.
 */
export const DELETE = write({
  scope: workspace,
  role: "owner",
  rate: "partner_invite",
  fresh: true,
  handle: ({ ctx, member }) => withdrawWorkspacePartnerInvite(ctx, member),
});
