import { read, workspace } from "@/server/route";
import { exportCall } from "@/server/export/call-export";

/**
 * GET /api/v1/calls/:id/export — one call as a text file: the transcript
 * and the analysis, for the business's own records. Any member, in the
 * workspace the tab named, ten a minute.
 *
 * The handle is exportCall in src/server/export/call-export.ts: the route is its declaration (who may, how often), the
 * verb is what it does.
 */
export const GET = read({
  scope: workspace,
  rate: "export",
  handle: ({ ctx, member }) => exportCall(ctx, member),
});
