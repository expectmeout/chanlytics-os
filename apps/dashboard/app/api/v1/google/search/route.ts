import { write, workspace } from "@/server/route";
import { searchGoogleFor } from "@/server/connections/google-actions";

/**
 * POST /api/v1/google/search — {query?}: what Google finds for the
 * business. Without words of its own the search uses the name and address
 * on record, which is the point: the owner already typed them once. A new
 * workspace has no receptionist yet, so its name is the one typed at
 * sign-up, the workspace's own: the first run's Find asks with it. Owners
 * only (linking is theirs); the edge asks Google.
 *
 * The handle is searchGoogleFor in src/server/connections/google-actions.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "google_search",
  handle: ({ ctx, req, member }) => searchGoogleFor(ctx, req, member),
});
