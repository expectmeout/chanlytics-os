import { write, account } from "@/server/route";
import { ReportProblemInput } from "@chanlytics/contracts";
import { fileProblemReport } from "@/server/platform/report";

/**
 * POST /api/v1/support/report — {words, page, error, workspace}: Report a problem, from anywhere in the app (decision
 * 0066). The report is kept first, then mailed to the support inbox with the member's address to reply to; the answer
 * is its number, which the sheet says, and whether the inbox has it. Any signed-in member may send one; the workspace is
 * taken only when they belong to it.
 */
export const POST = write({
  scope: account,
  role: null,
  rate: "support_report",
  input: ReportProblemInput,
  handle: async ({ ctx, input }) => fileProblemReport(ctx, input),
});
