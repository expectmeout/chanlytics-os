import { read, workspace } from "@/server/route";
import { startInstagramConnect } from "@/server/connections/instagram";

/**
 * GET /api/v1/channels/instagram/connect — the way to Instagram: a signed state naming the workspace, the person and
 * Instagram, then Instagram's consent screen for the business's professional account. Owners and managers (the settings
 * rung). The browser follows the redirect; the callback proves the state before trusting anything that comes back.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: ({ ctx, member }) => startInstagramConnect(ctx, member),
});
