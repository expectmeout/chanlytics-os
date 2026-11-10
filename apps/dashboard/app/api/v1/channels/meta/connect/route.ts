import { read, workspace } from "@/server/shared/route";
import { startMetaConnect } from "@/server/connections/meta";

/**
 * GET /api/v1/channels/meta/connect — the way to Meta: a signed state naming the workspace, the person and Meta, then
 * Facebook Login for Business's dialog with the app's saved configuration, where the owner signs in with Instagram or
 * Facebook and shares the business's Instagram account. Owners and managers (the settings rung), where the workspace's
 * switch is on. The browser follows the redirect; the callback proves the state before trusting anything that comes back.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: ({ ctx, member }) => startMetaConnect(ctx, member),
});
