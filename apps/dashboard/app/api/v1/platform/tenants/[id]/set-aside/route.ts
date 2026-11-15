import { z } from "zod";
import { asTenantId } from "@chanlytics/contracts";
import { read, platform } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { getSetAside } from "@/server/console/set-aside";

/** Which search to open; left out, the newest. */
const Query = z.object({ search: z.uuid().optional() });

/**
 * GET /api/v1/platform/tenants/:id/set-aside: what the finder set aside in one workspace (decision 0133), the team's
 * alone. Its searches the finder ran, each with what it counted, set aside and spent, and the places one of them judged
 * and did not count, each with why in the Leads page's own words. Read-only, on the platform scope.
 */
export const GET = read({
  scope: platform,
  query: Query,
  handle: async ({ ctx, office, input }) =>
    getSetAside(office, asTenantId(requireUuid(ctx.params.id, "workspace")), input.search ?? null),
});
