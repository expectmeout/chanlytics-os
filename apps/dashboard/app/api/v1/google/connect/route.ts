import { z } from "zod";
import { read, workspace } from "@/server/route";
import { startGoogleConnect } from "@/server/connections/google-actions";

const Query = z.object({
  /** Back to the first run that asked (decision 0073, R17), not to Connections. */
  back: z.enum(["start"]).optional(),
});

/**
 * GET /api/v1/google/connect[?back=start] — the way to Google: a signed state naming the workspace and the person, then
 * Google's consent screen. Owners only. The browser follows the redirect; the callback proves the state before trusting
 * anything that comes back with it, and returns to the first run's Your business where it asked (`back=start`).
 *
 * The handle is startGoogleConnect in src/server/connections/google-actions.ts: the route is its declaration (who may,
 * how often), the verb is what it does.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "google_link",
  query: Query,
  handle: ({ ctx, member, input }) => startGoogleConnect(ctx, member, input.back ?? null),
});
