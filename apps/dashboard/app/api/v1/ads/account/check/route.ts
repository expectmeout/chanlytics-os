import { write, workspace } from "@/server/shared/route";
import { checkAdAccount } from "@/server/ads/account";

/**
 * POST /api/v1/ads/account/check — Chanlytics looks again at the connected ad account and its Page, when the owner
 * comes back from mending something at Meta: no reload, no second sign-in. What it found is kept on the account, and the
 * card reads it. Never faster than Meta's own pace allows. The owner alone.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  handle: ({ ctx, member }) => checkAdAccount(ctx, member),
});
