import { read, platform } from "@/server/route";
import { FindQuerySchema } from "@chanlytics/contracts";
import { consoleFind } from "@/server/platform/console";

/**
 * GET /api/v1/platform/find?q= — the Console's Find (decision 0066): workspaces by name or address, owners by email,
 * lines by number, a caller's whole number (the workspace only, never who called), reports by their words or R-number.
 * The database function asks is_platform_admin() itself, on the session's own client.
 */
export const GET = read({
  scope: platform,
  query: FindQuerySchema,
  handle: async ({ office, input }) => ({ rows: await consoleFind(office, input.q) }),
});
