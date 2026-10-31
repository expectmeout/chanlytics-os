import { read, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { previewsTried } from "@/server/readers/leads";

/**
 * GET /api/v1/lead-previews: the leads who tried their own receptionist in the last three days (decision 0079), newest
 * first, each with what came of it and the business's name: Today's rows. Any member; under the caller's row security.
 * The body is its reader's (readers/leads.ts previewsTried), which Today's and Ask's reads take too.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), previewsTried, undefined)).data,
});
