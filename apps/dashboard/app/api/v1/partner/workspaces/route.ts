import { read, account } from "@/server/route";
import type { PartnerWorkspaceMoneyDto, PlatformTenantDto } from "@chanlytics/contracts";
import { getPartnerWorkspaces } from "@chanlytics/db";

/**
 * GET /api/v1/partner/workspaces — the workspaces the caller brought as a partner (decision 0012, P4): the back
 * office's row for each they still sit on the team of (00204 partner_overview, judged by the page with contracts'
 * platformRows), and the standing and earnings of each they ever brought. On the account: a partner is a person.
 * The database answers about the caller alone, so a caller who is no partner reads two empty lists.
 */
export const GET = read({
  scope: account,
  handle: async ({ ctx }): Promise<{ overview: PlatformTenantDto[]; money: PartnerWorkspaceMoneyDto[] }> => {
    const { overview, money } = await getPartnerWorkspaces(ctx.supabase);
    return { overview, money };
  },
});
