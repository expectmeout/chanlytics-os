import { read, workspace } from "@/server/route";
import { startGoogleConnect } from "@/server/connections/google-actions";

/**
 * GET /api/v1/google/connect — the way to Google: a signed state naming the
 * workspace and the person, then Google's consent screen. Owners only. The
 * browser follows the redirect; the callback proves the state before
 * trusting anything that comes back with it.
 *
 * The handle is startGoogleConnect in src/server/connections/google-actions.ts: the route is its declaration (who may,
 * how often), the verb is what it does.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "google_link",
  handle: ({ ctx, member }) => startGoogleConnect(ctx, member),
});
