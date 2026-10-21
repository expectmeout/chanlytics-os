import { read, platform } from "@/server/route";
import { SupportQuerySchema } from "@chanlytics/contracts";
import { consoleSupport } from "@/server/platform/console";

/**
 * GET /api/v1/platform/support?view=week|all — what customers reported from the app, and the setup asks of the same
 * days (decision 0066). The replies are the inbox's: this is where a shift sees what came in, and where one error that
 * reached several workspaces shows as one.
 */
export const GET = read({
  scope: platform,
  query: SupportQuerySchema,
  handle: async ({ office, input }) => consoleSupport(office, input.view),
});
