import { write, platform } from "@/server/route";
import { ClaimSchema } from "@chanlytics/contracts";
import { consoleClaim } from "@/server/platform/console";

/**
 * POST /api/v1/platform/claims — {tenant_id, take}: take a workspace for four hours, or let it go (decision 0066), so
 * two people on the team do not mend one thing at once. Not an act on the business, so it asks no reason and writes no
 * log row; a workspace someone else holds is refused with who.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_claim",
  input: ClaimSchema,
  handle: async ({ office, input }) => ({ claim: await consoleClaim(office, input.tenant_id, input.take) }),
});
