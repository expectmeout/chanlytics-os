import { read, platform } from "@/server/route";
import { consoleHome } from "@/server/platform/console";

/**
 * GET /api/v1/platform/home — the Console's Home (decision 0066): every workspace (grouped on the page by who the next
 * move is with), the numbers, who has taken which, and what came in this week. One read, as the back office's overview
 * was: the page asks once on open. A side read that failed comes back null, never empty.
 */
export const GET = read({
  scope: platform,
  handle: async ({ office }) => consoleHome(office),
});
