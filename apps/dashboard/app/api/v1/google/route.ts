import { read, workspace } from "@/server/route";
import { readGoogle } from "@/server/connections/google-actions";

/**
 * GET /api/v1/google — the business on Google as the workspace has it: the
 * listing, the connection, what this deployment can do (Places, the
 * Business Profile, the OAuth audience), the reply policy, the caller's role.
 *
 * The handle is readGoogle in src/server/connections/google-actions.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
export const GET = read({
  scope: workspace,
  handle: ({ ctx, member }) => readGoogle(ctx, member),
});
