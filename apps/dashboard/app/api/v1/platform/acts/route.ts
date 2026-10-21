import { read, platform } from "@/server/route";
import { ActsQuerySchema, actsCsv } from "@chanlytics/contracts";
import { consoleActs } from "@/server/platform/acts";

/**
 * GET /api/v1/platform/acts?who=&before=&format=rows|csv — the Admin log (decision 0066): every act the team took,
 * newest first, a page at a time, one person's or everyone's; or the log as a CSV file's text, for the record. Every
 * role reads it: who did what, where and why is the whole team's to see.
 */
export const GET = read({
  scope: platform,
  query: ActsQuerySchema,
  handle: async ({ office, input }) => {
    const rows = await consoleActs(office, {
      ...(input.who ? { who: input.who } : {}),
      ...(input.before ? { before: input.before } : {}),
      csv: input.format === "csv",
    });
    return input.format === "csv" ? { rows: [], csv: actsCsv(rows) } : { rows, csv: null };
  },
});
