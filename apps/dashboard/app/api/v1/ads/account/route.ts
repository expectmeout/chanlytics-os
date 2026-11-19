import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { adAccount } from "@/server/readers/ad-account";

/**
 * GET /api/v1/ads/account — the workspace's ad account on Facebook and Instagram as its card draws it: where the
 * connection stands, who Meta charges, the Page the ads run as, the five checks, whether Connect is offered here and
 * whether this member may press it. The body is its reader's (readers/ad-account.ts), which AI reads too.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), adAccount, undefined)).data,
});
