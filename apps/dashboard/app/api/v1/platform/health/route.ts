import { read, platform } from "@/server/route";
import { HealthQuerySchema } from "@chanlytics/contracts";
import { consoleHealth } from "@/server/platform/health";

/**
 * GET /api/v1/platform/health?days=7|30 — the Console's Health (decision 0068): every clock beside its runs, the jobs
 * that failed, what paged us, the promises a day at a time, every part's numbers (sends, calls, webhooks, the model,
 * Ask, deliveries, connections), the errors pages hit, and how fast the pages are. One read on open; a part that could
 * not be read comes back null, never empty, and the page says so.
 */
export const GET = read({
  scope: platform,
  query: HealthQuerySchema,
  handle: async ({ office, input }) => consoleHealth(office, input.days === 7 ? 7 : 30),
});
