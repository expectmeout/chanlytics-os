import { read, platform } from "@/server/shared/route";
import { consoleBugs } from "@/server/console/support";

/**
 * GET /api/v1/platform/support/bugs — Health's bug reports (decision 0067): the last thirty days of "Something isn't
 * working", each with who sent it, for Health to group by error and send a question back to Support.
 */
export const GET = read({
  scope: platform,
  handle: async ({ office }) => consoleBugs(office),
});
