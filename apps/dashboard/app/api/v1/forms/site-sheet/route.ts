import { z } from "zod";
import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { outsideFormSheet } from "@/server/forms/outside";

/**
 * GET /api/v1/forms/site-sheet?form=<id>: one form the business's own website owns, opened in Campaigns › Forms (00709):
 * its names, its site and where that stands, what it brought over the last thirty days, and its newest entries. Any
 * member. The body is its reader's (server/forms/outside.ts outsideFormSheet).
 */
export const GET = read({
  scope: workspace,
  query: z.object({ form: z.uuid() }),
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), outsideFormSheet, input)).data,
});
