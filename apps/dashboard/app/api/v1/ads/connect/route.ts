import { read, workspace } from "@/server/shared/route";
import { startAdsConnect } from "@/server/ads/account";

/**
 * GET /api/v1/ads/connect — the way to Meta's own window: a signed state naming the workspace, the person and this
 * sign-in, then Facebook Login for Business with the app's saved sign-in for ads, where the owner chooses their ad
 * account and Page. The owner alone (decision 0050, call 2), where Ads is offered in the workspace. The browser follows
 * the redirect; the callback proves the state before trusting anything that comes back.
 */
export const GET = read({
  scope: workspace,
  role: "owner",
  rate: "settings",
  handle: ({ ctx, member }) => startAdsConnect(ctx, member),
});
