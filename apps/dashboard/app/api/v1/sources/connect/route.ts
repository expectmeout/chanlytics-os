import { read, workspace } from "@/server/shared/route";
import { startSourceConnect } from "@/server/files/sources";

/**
 * GET /api/v1/sources/connect — the way to Google's own window: a signed state naming the workspace, the person and
 * this sign-in, then Google's consent for Drive, read only. An owner or a partner. The browser follows the redirect;
 * the callback proves the state before trusting anything that comes back.
 *
 * The handle is startSourceConnect in src/server/files/sources.ts.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: ({ ctx, member }) => startSourceConnect(ctx, member),
});
