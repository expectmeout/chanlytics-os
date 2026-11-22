import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { formsReport } from "@/server/readers/forms";

/**
 * GET /api/v1/reports/forms: what a business's forms brought over the last thirty days (00680), as Reports › Campaigns
 * says it: each form that was ever published, with its opens, its requests, the conversations and visits that followed,
 * who was new, and each place a request came through. Any member. The body is its reader's (readers/forms.ts formsReport).
 */
export const GET = read({
  scope: workspace,
  rate: "aggregate",
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), formsReport, undefined)).data,
});
