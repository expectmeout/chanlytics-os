import { write, account } from "@/server/route";
import { ReportProblemInput } from "@chanlytics/contracts";
import { fileProblemReport } from "@/server/platform/report";

/**
 * POST /api/v1/support/report — {kind, words, page, error, workspace}: Get help, from anywhere in the app (decisions
 * 0066 and 0067). The report is kept first with what the member needs, then mailed to the support inbox with their
 * address to reply to; the answer is its number, which the sheet says, whether the inbox has it, and the one line that
 * helps until a person answers. Any signed-in member may send one; the workspace is taken only when they belong to it.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "support_report",
  input: ReportProblemInput,
  handle: async ({ ctx, input }) => fileProblemReport(ctx, input),
});
