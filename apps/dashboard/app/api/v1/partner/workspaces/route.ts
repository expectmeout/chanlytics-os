import { read, write, account } from "@/server/route";
import {
  HandoverCreateSchema,
  type PartnerHandoverDto,
  type PartnerWorkspaceMoneyDto,
  type PlatformTenantDto,
} from "@chanlytics/contracts";
import { createWorkspaceForBusiness, getPartnerHandovers, getPartnerWorkspaces } from "@chanlytics/db";
import { handoverRefusal, sendHandoverInvite } from "@/server/workspace/handover";

/**
 * GET /api/v1/partner/workspaces — the workspaces the caller brought as a partner (decision 0012, P4): the back
 * office's row for each they still sit on the team of (00204 partner_overview, judged by the page with contracts'
 * platformRows), and the standing and earnings of each they ever brought; and the handover of each they set up for a
 * business (0016). On the account: a partner is a person. The database answers about the caller alone, so a caller
 * who is no partner reads three empty lists.
 */
export const GET = read({
  scope: account,
  handle: async ({
    ctx,
  }): Promise<{
    overview: PlatformTenantDto[];
    money: PartnerWorkspaceMoneyDto[];
    handovers: PartnerHandoverDto[];
  }> => {
    const [{ overview, money }, handovers] = await Promise.all([
      getPartnerWorkspaces(ctx.supabase),
      getPartnerHandovers(ctx.supabase),
    ]);
    return { overview, money, handovers };
  },
});

/**
 * POST /api/v1/partner/workspaces — {name, timezone?, email}: the caller, an active partner, sets a workspace up for
 * a business and hands it to its owner (decision 0016, 00214 create_workspace_for_business). They sit on it as its
 * partner, never its owner; the owner is invited, and owns it once they accept. `sent` says whether the invitation
 * went: the workspace is made either way, and the invitation can be sent again.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "partner_handover",
  input: HandoverCreateSchema,
  handle: async ({ ctx, input }): Promise<{ workspace: { id: string; slug: string; name: string }; sent: boolean }> => {
    const r = await createWorkspaceForBusiness(ctx.supabase, {
      name: input.name,
      timezone: input.timezone ?? null,
      ownerEmail: input.email,
    });
    if (!r.ok) throw handoverRefusal(r);
    const sent = await sendHandoverInvite(r.value.id, input.email);
    return { workspace: r.value, sent };
  },
});
