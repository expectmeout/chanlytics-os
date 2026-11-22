import { z } from "zod";
import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { formSheet } from "@/server/readers/forms";

/**
 * GET /api/v1/forms/sheet?form=<id>: one form's sheet (00680): the form as it is being changed and as visitors see it,
 * each place it is shared with what that place brought over the last thirty days, its newest entries, and its held
 * pile. Any member. The body is its reader's (readers/forms.ts formSheet).
 */
export const GET = read({
  scope: workspace,
  query: z.object({ form: z.uuid() }),
  handle: async ({ ctx, member, input }) => (await load(readerContext(ctx, member), formSheet, input)).data,
});
