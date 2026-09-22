import { read, workspace } from "@/server/route";
import { reviewReplyModeOf, type GoogleDto } from "@chanlytics/contracts";
import { listPolicies } from "@chanlytics/db";
import { googleFor, googleReadiness } from "@/server/google";

/**
 * GET /api/v1/google — the business on Google as the workspace has it: the
 * listing, the connection, what this deployment can do (Places, the
 * Business Profile, the OAuth audience), the reply policy, the caller's role.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const [data, ready, policies] = await Promise.all([
      googleFor(ctx.supabase, member.tenantId),
      googleReadiness(),
      listPolicies(ctx.supabase, member.tenantId),
    ]);
    const google: GoogleDto = {
      ready: { places: ready.places, profile: ready.profile, audience: ready.audience },
      ...data,
      reply_mode: reviewReplyModeOf(policies),
    };
    return { google };
  },
});
